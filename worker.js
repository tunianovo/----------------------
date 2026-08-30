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
const publicUser = (u) => ({
  id: Number(u.id),
  username: u.username,
  real_name: u.real_name,
  user_type: Number(u.user_type),
  skill_tag: u.skill_tag,
  phone: u.phone,
  avatar: u.avatar,
  created_at: Number(u.created_at)
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

  const { results } = await env.chat_db.prepare("SELECT COUNT(*) AS c FROM users").all();
  if (Number(results[0].c) > 0) return;

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
}

// 从 Authorization 头解析登录用户
async function getAuthUser(env, request) {
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return null;
  const { results } = await env.chat_db.prepare("SELECT * FROM users WHERE token = ?").bind(auth).all();
  return results[0] || null;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const q = url.searchParams;
    await ensureSeed(env);
    const readBody = async () => { try { return await request.json(); } catch { return {}; } };

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

    // 批量查用户公开资料 GET /users?ids=1,2,3 （用于显示昵称/头像，无需登录）
    if (url.pathname === '/users' && request.method === 'GET') {
      const ids = q.get('ids') || '';
      const list = ids.split(',').map(Number).filter(Boolean);
      if (!list.length) return json([]);
      const { results } = await env.chat_db.prepare(
        `SELECT id, username, real_name, user_type, skill_tag, phone, avatar, created_at FROM users WHERE id IN (${list.map(() => '?').join(',')})`
      ).bind(...list).all();
      return json(results.map(publicUser));
    }

    // ---------- 以下接口需要登录（token） ----------
    const me = await getAuthUser(env, request);
    if (!me) return json({ error: '未登录或登录已过期' }, 401);

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
          env.chat_db.prepare(`SELECT id, username, real_name, user_type, skill_tag, phone, avatar, created_at FROM users WHERE id = ?`).bind(peerId).all()
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

    return json({ msg: 'route not found' }, 404);
  }
};
