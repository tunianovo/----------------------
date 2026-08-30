// ============================================================
// 技能共享平台 - 聊天/用户后端（Cloudflare Worker + D1）
// 新版：用户注册/登录/鉴权（Bearer token）+ 私信收发 + 会话列表
// D1 数据库绑定名称：chat_db
// 部署：Cloudflare 控制台 -> Workers -> 你的 worker -> 编辑代码 -> 粘贴本文件
// 说明：首次请求会自动创建 users 表并写入 7 个测试账号（密码均为 123456）
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
});

// ---------- 密码哈希（PBKDF2-SHA256，100000 轮，每用户随机盐，与前端测试环境一致） ----------
function bytesToHex(b) { return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(h) { const a = []; for (let i = 0; i < h.length; i += 2) a.push(parseInt(h.slice(i, i + 2), 16)); return new Uint8Array(a); }

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return bytesToHex(bits);
}
async function makePasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(salt) + ':' + await hashPassword(password, bytesToHex(salt));
}
async function verifyPassword(password, stored) {
  const [salt, h] = String(stored).split(':');
  return h != null && (await hashPassword(password, salt)) === h;
}
const newToken = () => crypto.randomUUID() + crypto.randomUUID().slice(0, 12);

// 只返回对外可见的用户字段（绝不返回密码哈希/token）
// online：3分钟内有心跳即在线；last_seen 为最近活跃时间
const ONLINE_WINDOW = 3 * 60 * 1000;
const publicUser = (u) => ({
  id: Number(u.id),
  username: u.username,
  real_name: u.real_name,
  user_type: Number(u.user_type),
  skill_tag: u.skill_tag,
  phone: u.phone,
  avatar: u.avatar,
  created_at: Number(u.created_at),
  last_seen: u.last_seen ? Number(u.last_seen) : null,
  online: !!(u.last_seen && (Date.now() - Number(u.last_seen)) < ONLINE_WINDOW)
});

// ---------- 首次运行：建表 + 种子用户（每个 isolate 只执行一次） ----------
let seedPromise = null;
function ensureSeed(env) {
  if (!seedPromise) seedPromise = ensureSeedUsers(env);
  return seedPromise;
}
async function ensureSeedUsers(env) {
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      real_name TEXT NOT NULL,
      user_type INTEGER NOT NULL DEFAULT 0,
      skill_tag TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      avatar TEXT,
      token TEXT,
      created_at INTEGER NOT NULL
    )
  `).run();
  // v3：在线状态（心跳时间戳）
  await env.chat_db.prepare("ALTER TABLE users ADD COLUMN last_seen INTEGER").run().catch(() => {});
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS private_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      create_time INTEGER NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  await env.chat_db.prepare(`CREATE INDEX IF NOT EXISTS idx_pm_pair ON private_messages(sender_id, receiver_id)`).run();

  // v3：服务市场 + 订单（网站这两块数据原先只在各设备本地，App 需要服务端统一数据源）
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      service_desc TEXT NOT NULL,
      price REAL NOT NULL,
      service_type TEXT NOT NULL,
      sub_category TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      cover TEXT DEFAULT '',
      status INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      buyer_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      order_price REAL NOT NULL,
      order_status INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `).run();

  const { results } = await env.chat_db.prepare("SELECT COUNT(*) AS c FROM users").all();
  if (Number(results[0].c) > 0) {
    await seedServicesIfEmpty(env);
    return;
  }

  const seeds = [
    { id: 1, username: 'editor01', real_name: '张剪辑', user_type: 1, skill_tag: '剪辑,调色,字幕', phone: '13800000001' },
    { id: 2, username: 'designer01', real_name: '李设计', user_type: 1, skill_tag: '设计,UI,插画', phone: '13800000002' },
    { id: 3, username: 'customer01', real_name: '王客户', user_type: 0, skill_tag: '', phone: '13800000003' },
    { id: 4, username: 'photo01', real_name: '赵摄影', user_type: 1, skill_tag: '摄影,修图,跟拍', phone: '13800000004' },
    { id: 5, username: 'handmade01', real_name: '陈手作', user_type: 1, skill_tag: '手工,滴胶,编织', phone: '13800000005' },
    { id: 6, username: 'tutor01', real_name: '刘家教', user_type: 1, skill_tag: '家教,数学,物理', phone: '13800000006' },
    { id: 7, username: 'code01', real_name: '孙程序', user_type: 1, skill_tag: '编程,前端,Python', phone: '13800000007' },
  ];
  const now = Date.now();
  for (const s of seeds) {
    const hash = await makePasswordHash('123456');
    await env.chat_db.prepare(`
      INSERT INTO users (id, username, password_hash, real_name, user_type, skill_tag, phone, avatar, token, created_at)
      VALUES (?,?,?,?,?,?,?,NULL,NULL,?)
    `).bind(s.id, s.username, hash, s.real_name, s.user_type, s.skill_tag, s.phone, now).run();
  }
  await seedServicesIfEmpty(env);
}

// 服务种子数据（与网站本地数据一致；cover 为网站静态图相对路径）。表为空时才插入
async function seedServicesIfEmpty(env) {
  const svc = await env.chat_db.prepare("SELECT COUNT(*) AS c FROM services").all();
  if (Number(svc.results[0].c) > 0) return;
  const seedServices = [
    { user_id: 1, title: '短视频剪辑与后期', service_desc: '提供短视频剪辑、字幕添加、BGM配乐、调色服务，支持抖音/小红书/B站等平台格式输出，24小时内交付。', price: 80, service_type: '线上数字服务', sub_category: '短视频剪辑', tags: ['剪辑','调色','字幕'], cover: 'images/task-clip.jpg' },
    { user_id: 2, title: 'PPT定制美化设计', service_desc: '专业PPT设计，涵盖答辩、汇报、商业计划书等场景，提供模板定制、内容排版、动画效果，可加急交付。', price: 150, service_type: '线上数字服务', sub_category: 'PPT制作', tags: ['PPT','设计','排版'], cover: 'images/task-ppt.jpg' },
    { user_id: 4, title: '校园活动跟拍摄影', service_desc: '杭州同城线下摄影服务，覆盖校园活动、毕业照、人像写真，提供精修20张+原片全送，需提前3天预约。', price: 300, service_type: '同城线下劳务', sub_category: '摄影跟拍', tags: ['摄影','跟拍','修图'], cover: 'images/task-photo.jpg' },
    { user_id: 5, title: '手工滴胶饰品定制', service_desc: '纯手工滴胶饰品定制，可做钥匙扣、书签、吊坠等，支持来图定制、颜色自选，3-5天交付。', price: 50, service_type: '手作实物定制', sub_category: '滴胶作品', tags: ['手工','滴胶','定制'], cover: 'images/task-handmade.jpg' },
    { user_id: 2, title: '海报/宣传单平面设计', service_desc: '专业平面设计，涵盖海报、宣传单、名片、公众号配图等，提供3版修改，源文件交付。', price: 120, service_type: '线上数字服务', sub_category: '平面设计', tags: ['设计','海报','排版'], cover: 'images/task-design.jpg' },
    { user_id: 7, title: 'Python脚本/小程序开发', service_desc: 'Python自动化脚本、数据处理、爬虫、微信小程序开发，可提供源码和注释，支持后续维护。', price: 200, service_type: '线上数字服务', sub_category: '编程开发', tags: ['编程','Python','前端'], cover: 'images/task-code.jpg' },
    { user_id: 6, title: '高数/大物家教辅导', service_desc: '大一高等数学、大学物理家教辅导，可线上/线下，擅长期末冲刺、知识点梳理，提分明显。', price: 80, service_type: '同城线下劳务', sub_category: '家教辅导', tags: ['家教','数学','物理'], cover: 'images/task-ppt.jpg' },
    { user_id: 1, title: 'Vlog/旅拍视频剪辑', service_desc: 'Vlog、旅拍、生活记录视频剪辑，支持4K输出，包含调色、转场、字幕、BGM，风格可定制。', price: 120, service_type: '线上数字服务', sub_category: '短视频剪辑', tags: ['剪辑','Vlog','调色'], cover: 'images/task-clip.jpg' },
  ];
  for (const s of seedServices) {
    await env.chat_db.prepare(`
      INSERT INTO services (user_id, title, service_desc, price, service_type, sub_category, tags, cover, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,1,?)
    `).bind(s.user_id, s.title, s.service_desc, s.price, s.service_type, s.sub_category, JSON.stringify(s.tags), s.cover, Date.now()).run();
  }
}

// 从 Authorization 头解析登录用户
async function getAuthUser(env, request) {
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return null;
  const { results } = await env.chat_db.prepare("SELECT * FROM users WHERE token = ?").bind(auth).all();
  return results[0] || null;
}

export async function handler(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const q = url.searchParams;
    await ensureSeed(env);
    const readBody = async () => { try { return await request.json(); } catch { return {}; } };

    // 根路径：API 状态信息（浏览器直接访问可确认部署成功）
    if (url.pathname === '/') {
      return json({
        ok: true,
        service: 'chat-api',
        version: 'v2',
        endpoints: ['/register', '/login', '/users', '/me', '/send', '/history', '/read', '/conversations'],
        time: Date.now()
      });
    }

    // ---------- 公开接口 ----------

    // 注册 POST /register {username,password,real_name,user_type,skill_tag,phone,avatar}
    if (url.pathname === '/register' && request.method === 'POST') {
      const b = await readBody();
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      if (!username || !password) return json({ error: '账号和密码不能为空' }, 400);
      if (username.length > 32 || password.length < 6) return json({ error: '密码至少6位，账号不超过32字符' }, 400);
      const dup = await env.chat_db.prepare("SELECT id FROM users WHERE username = ?").bind(username).all();
      if (dup.results.length) return json({ error: '账号已存在' }, 400);
      const user = {
        username,
        password_hash: await makePasswordHash(password),
        real_name: String(b.real_name || '').trim() || username,
        user_type: Number(b.user_type) === 1 ? 1 : 0,
        skill_tag: String(b.skill_tag || ''),
        phone: String(b.phone || ''),
        avatar: b.avatar || null,
        token: newToken(),
        created_at: Date.now()
      };
      const res = await env.chat_db.prepare(`
        INSERT INTO users (username, password_hash, real_name, user_type, skill_tag, phone, avatar, token, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).bind(user.username, user.password_hash, user.real_name, user.user_type, user.skill_tag, user.phone, user.avatar, user.token, user.created_at).run();
      return json({ ok: true, user: { ...publicUser(user), id: res.meta.last_row_id }, token: user.token });
    }

    // 登录 POST /login {username,password} -> 返回 user + 新 token
    if (url.pathname === '/login' && request.method === 'POST') {
      const b = await readBody();
      const username = String(b.username || '').trim();
      const { results } = await env.chat_db.prepare("SELECT * FROM users WHERE username = ?").bind(username).all();
      const u = results[0];
      if (!u || !(await verifyPassword(String(b.password || ''), u.password_hash))) return json({ error: '账号或密码错误' }, 401);
      const token = newToken();
      await env.chat_db.prepare("UPDATE users SET token = ? WHERE id = ?").bind(token, u.id).run();
      return json({ ok: true, user: publicUser({ ...u, token }), token });
    }

    // 查用户公开资料：GET /users?ids=1,2,3 批量，或 GET /users?username=xxx 按账号精确查找（发起新聊天用）
    if (url.pathname === '/users' && request.method === 'GET') {
      const COLS = 'id, username, real_name, user_type, skill_tag, phone, avatar, created_at, last_seen';
      const uname = (q.get('username') || '').trim();
      if (uname) {
        const { results } = await env.chat_db.prepare(`SELECT ${COLS} FROM users WHERE username = ?`).bind(uname).all();
        return json(results.map(publicUser));
      }
      const ids = q.get('ids') || '';
      const list = ids.split(',').map(Number).filter(Boolean);
      if (!list.length) return json([]);
      const { results } = await env.chat_db.prepare(
        `SELECT ${COLS} FROM users WHERE id IN (${list.map(() => '?').join(',')})`
      ).bind(...list).all();
      return json(results.map(publicUser));
    }

    // ---------- 以下接口需要登录（token） ----------
    const PROTECTED = ['/me', '/send', '/history', '/read', '/conversations', '/heartbeat', '/orders'];
    const me = PROTECTED.includes(url.pathname) ? await getAuthUser(env, request) : null;
    if (PROTECTED.includes(url.pathname) && !me) return json({ error: '未登录或登录已过期' }, 401);

    // 心跳 POST /heartbeat：App/网站定期调用，用于在线状态
    if (url.pathname === '/heartbeat' && request.method === 'POST') {
      await env.chat_db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(Date.now(), Number(me.id)).run();
      return json({ ok: true, online: true });
    }

    // 当前用户资料 GET /me
    if (url.pathname === '/me' && request.method === 'GET') return json(publicUser(me));

    // 发送私信 POST /send {receiver_id, content}（发送者由 token 判定，不可伪造）
    if (url.pathname === '/send' && request.method === 'POST') {
      const b = await readBody();
      const receiverId = Number(b.receiver_id);
      const content = String(b.content || '').trim();
      if (!receiverId || !content) return json({ error: '缺少接收人或消息内容' }, 400);
      if (content.length > 2000) return json({ error: '消息内容过长（最多2000字）' }, 400);
      const res = await env.chat_db.prepare(`
        INSERT INTO private_messages (sender_id, receiver_id, content, create_time, is_read) VALUES (?,?,?,?,0)
      `).bind(Number(me.id), receiverId, content, Date.now()).run();
      return json({ ok: true, changes: res.meta.changes });
    }

    // 聊天历史 GET /history?peer_id=xxx
    if (url.pathname === '/history' && request.method === 'GET') {
      const peerId = Number(q.get('peer_id'));
      if (!peerId) return json({ error: '缺少 peer_id' }, 400);
      const { results } = await env.chat_db.prepare(`
        SELECT * FROM private_messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY create_time ASC
      `).bind(Number(me.id), peerId, peerId, Number(me.id)).all();
      return json(results.map(r => ({
        id: Number(r.id),
        sender_id: Number(r.sender_id),
        receiver_id: Number(r.receiver_id),
        content: r.content,
        create_time: r.create_time,
        is_read: Number(r.is_read)
      })));
    }

    // 标记已读 POST /read {peer_id}
    if (url.pathname === '/read' && request.method === 'POST') {
      const b = await readBody();
      const peerId = Number(b.peer_id);
      if (!peerId) return json({ error: '缺少 peer_id' }, 400);
      await env.chat_db.prepare("UPDATE private_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0")
        .bind(peerId, Number(me.id)).run();
      return json({ ok: true });
    }

    // 会话列表 GET /conversations （返回对方昵称/头像/最后消息/未读数）
    if (url.pathname === '/conversations' && request.method === 'GET') {
      const { results } = await env.chat_db.prepare(`
        SELECT
          CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS peer_id,
          MAX(create_time) AS last_time
        FROM private_messages
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY peer_id
        ORDER BY last_time DESC
      `).bind(Number(me.id), Number(me.id), Number(me.id)).all();

      const convs = [];
      for (const row of results) {
        const peerId = Number(row.peer_id);
        const [last, unread, user] = await Promise.all([
          env.chat_db.prepare(`SELECT content FROM private_messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY create_time DESC LIMIT 1`).bind(Number(me.id), peerId, peerId, Number(me.id)).all(),
          env.chat_db.prepare(`SELECT COUNT(*) AS c FROM private_messages WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`).bind(peerId, Number(me.id)).all(),
          env.chat_db.prepare(`SELECT id, username, real_name, user_type, skill_tag, phone, avatar, created_at, last_seen FROM users WHERE id = ?`).bind(peerId).all()
        ]);
        const u = user.results[0] || null;
        convs.push({
          peer_id: peerId,
          name: u ? (u.real_name || u.username) : '用户',
          avatar: u ? u.avatar : null,
          last_time: row.last_time,
          last_msg: last.results[0] ? last.results[0].content : '',
          unread: Number(unread.results[0].c)
        });
      }
      return json(convs);
    }

    // 服务市场 GET /services （公开；带卖家昵称/在线状态）
    if (url.pathname === '/services' && request.method === 'GET') {
      const { results } = await env.chat_db.prepare(`
        SELECT s.*, u.real_name AS seller_name, u.username AS seller_username, u.avatar AS seller_avatar, u.last_seen AS seller_last_seen
        FROM services s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.status = 1 ORDER BY s.created_at DESC
      `).all();
      return json(results.map(r => ({
        id: Number(r.id),
        user_id: Number(r.user_id),
        seller_name: r.seller_name || r.seller_username || '用户',
        seller_avatar: r.seller_avatar,
        online: !!(r.seller_last_seen && (Date.now() - Number(r.seller_last_seen)) < ONLINE_WINDOW),
        title: r.title,
        service_desc: r.service_desc,
        price: Number(r.price),
        service_type: r.service_type,
        sub_category: r.sub_category,
        tags: (() => { try { return JSON.parse(r.tags || '[]'); } catch { return []; } })(),
        cover: r.cover,
        created_at: Number(r.created_at)
      })));
    }

    // 下单 POST /orders {service_id}：生成订单，并自动给卖家发一条消息建立会话
    if (url.pathname === '/orders' && request.method === 'POST') {
      const b = await readBody();
      const serviceId = Number(b.service_id);
      if (!serviceId) return json({ error: '缺少 service_id' }, 400);
      const { results } = await env.chat_db.prepare("SELECT * FROM services WHERE id = ? AND status = 1").bind(serviceId).all();
      const svc = results[0];
      if (!svc) return json({ error: '服务不存在或已下架' }, 404);
      if (Number(svc.user_id) === Number(me.id)) return json({ error: '不能下单自己的服务' }, 400);
      const res = await env.chat_db.prepare(`
        INSERT INTO orders (service_id, buyer_id, seller_id, order_price, order_status, created_at)
        VALUES (?,?,?,?,0,?)
      `).bind(serviceId, Number(me.id), Number(svc.user_id), Number(svc.price), Date.now()).run();
      await env.chat_db.prepare(`
        INSERT INTO private_messages (sender_id, receiver_id, content, create_time, is_read) VALUES (?,?,?,?,0)
      `).bind(Number(me.id), Number(svc.user_id), `【订单】我下单了你的服务「${svc.title}」（¥${svc.price}），请和我沟通需求详情～`, Date.now()).run();
      return json({ ok: true, order_id: res.meta.last_row_id });
    }

    // 我的订单 GET /orders （买家或卖家视角）
    if (url.pathname === '/orders' && request.method === 'GET') {
      const { results } = await env.chat_db.prepare(`
        SELECT o.*, s.title AS service_title, s.cover AS service_cover,
               bu.real_name AS buyer_name, se.real_name AS seller_name
        FROM orders o
        LEFT JOIN services s ON s.id = o.service_id
        LEFT JOIN users bu ON bu.id = o.buyer_id
        LEFT JOIN users se ON se.id = o.seller_id
        WHERE o.buyer_id = ? OR o.seller_id = ?
        ORDER BY o.created_at DESC
      `).bind(Number(me.id), Number(me.id)).all();
      return json(results.map(r => ({
        id: Number(r.id),
        service_id: Number(r.service_id),
        service_title: r.service_title,
        service_cover: r.service_cover,
        buyer_id: Number(r.buyer_id),
        seller_id: Number(r.seller_id),
        buyer_name: r.buyer_name || '用户',
        seller_name: r.seller_name || '用户',
        am_buyer: Number(r.buyer_id) === Number(me.id),
        order_price: Number(r.order_price),
        order_status: Number(r.order_status),
        created_at: Number(r.created_at)
      })));
    }

    return json({ msg: 'route not found' }, 404);
  }
