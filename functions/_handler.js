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
  online: !!(u.last_seen && (Date.now() - Number(u.last_seen)) < ONLINE_WINDOW),
  bio: u.bio || '',
  discoverable: u.discoverable === 0 ? 0 : 1
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

  // v4：多设备会话表 —— 网站和App同时登录互不顶号（此前单token设计，后登录会挤掉先登录的）
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.chat_db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`).run();

  // v4：共创项目（原网站为本地数据，App需要统一数据源）
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      project_desc TEXT NOT NULL,
      creator_id INTEGER NOT NULL,
      total_budget REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'recruiting',
      members TEXT DEFAULT '[]',
      need_skills TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL
    )
  `).run();

  // v5：需求（任务）大厅 + 短信验证码
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      task_desc TEXT NOT NULL,
      budget REAL NOT NULL DEFAULT 0,
      deadline TEXT DEFAULT '',
      publisher_id INTEGER NOT NULL,
      taker_id INTEGER,
      status INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `).run();
  // v7：作品展示（base64，随用户）
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS works (
      user_id INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (user_id, idx)
    )
  `).run();

  // v6：群聊（群信息/群消息/进群邀请/已读位点）
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      members TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS group_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      create_time INTEGER NOT NULL
    )
  `).run();
  await env.chat_db.prepare(`CREATE INDEX IF NOT EXISTS idx_gm_group ON group_messages(group_id)`).run();
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS group_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      invitee_id INTEGER NOT NULL,
      inviter_id INTEGER NOT NULL,
      status INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS group_reads (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      last_read INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id)
    )
  `).run();
  // 订单交易快照列
  for (const col of ['service_desc TEXT', 'service_cover TEXT', 'service_type TEXT', 'sub_category TEXT']) {
    await env.chat_db.prepare(`ALTER TABLE orders ADD COLUMN ${col}`).run().catch(() => {});
  }
  // 隐私：是否可被发现 + 个人简介
  await env.chat_db.prepare("ALTER TABLE users ADD COLUMN discoverable INTEGER DEFAULT 1").run().catch(() => {});
  await env.chat_db.prepare("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''").run().catch(() => {});

  await env.chat_db.prepare(`
    CREATE TABLE IF NOT EXISTS sms_codes (
      phone TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      last_sent INTEGER NOT NULL,
      sent_today INTEGER NOT NULL DEFAULT 0,
      day TEXT NOT NULL
    )
  `).run();

  const { results } = await env.chat_db.prepare("SELECT COUNT(*) AS c FROM users").all();
  if (Number(results[0].c) > 0) {
    await seedServicesIfEmpty(env);
    await seedProjectsIfEmpty(env);
    await seedTasksIfEmpty(env);
    await ensureKefuAccount(env);
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
async function seedServicesIfEmpty(env) {  const svc = await env.chat_db.prepare("SELECT COUNT(*) AS c FROM services").all();
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

// 共创项目种子数据（与网站一致）。表为空时才插入
async function seedProjectsIfEmpty(env) {
  const p = await env.chat_db.prepare("SELECT COUNT(*) AS c FROM projects").all();
  if (Number(p.results[0].c) > 0) return;
  const seeds = [
    { creator_id: 1, project_name: '校园短视频创作团队', project_desc: '组建一支校园短视频创作团队，共同打造校园生活类短视频，分工包括编剧、拍摄、剪辑、运营，收益按贡献分配。', total_budget: 500, need_skills: ['编剧', '拍摄', '运营'], members: [{ user_id: 1, role: '发起人/剪辑' }] },
    { creator_id: 2, project_name: '大创比赛PPT与答辩支持', project_desc: '为参加大创比赛的团队提供PPT制作、答辩模拟、视觉设计支持，需要设计和演讲能力的同学加入。', total_budget: 300, need_skills: ['PPT设计', '答辩', '文案'], members: [{ user_id: 2, role: '发起人/设计' }] },
  ];
  for (const s of seeds) {
    await env.chat_db.prepare(`
      INSERT INTO projects (project_name, project_desc, creator_id, total_budget, status, members, need_skills, created_at)
      VALUES (?,?,?,?,'recruiting',?,?,?)
    `).bind(s.project_name, s.project_desc, s.creator_id, s.total_budget, JSON.stringify(s.members), JSON.stringify(s.need_skills), Date.now()).run();
  }
}

// 需求（任务）种子数据。表为空时才插入
async function seedTasksIfEmpty(env) {
  const t = await env.chat_db.prepare("SELECT COUNT(*) AS c FROM tasks").all();
  if (Number(t.results[0].c) > 0) return;
  const seeds = [
    { publisher_id: 3, title: '需要剪辑一条1分钟社团招新视频', task_desc: '社团招新视频，素材已拍好约20分钟，需要剪成1分钟左右的招新宣传片，加字幕和BGM。', budget: 100, deadline: '3天内' },
    { publisher_id: 3, title: '求一份挑战杯答辩PPT美化', task_desc: '挑战杯项目答辩PPT，内容已有初稿约15页，需要美化设计，统一风格，加动画，适合现场答辩。', budget: 200, deadline: '下周三前' },
    { publisher_id: 3, title: '杭州下沙毕业照跟拍半天', task_desc: '4人宿舍毕业照，在下沙校区拍摄半天，需要精修15张，原片全送。', budget: 250, deadline: '本周六' },
    { publisher_id: 3, title: 'Python数据处理小脚本', task_desc: '需要一个Python脚本，批量处理Excel数据，做格式转换和统计，输出汇总表格。', budget: 150, deadline: '一周内' },
    { publisher_id: 3, title: '公众号文章排版+封面设计', task_desc: '校园公众号推文，内容已写好约2000字，需要排版美化+设计封面图，风格清新文艺。', budget: 90, deadline: '3天内' },
    { publisher_id: 3, title: '手工编织毛线围巾定制', task_desc: '想要一条粗毛线围巾，藏青色，送男生，长度180cm左右，纯手工编织。', budget: 120, deadline: '两周内' },
  ];
  for (const s of seeds) {
    await env.chat_db.prepare(`
      INSERT INTO tasks (title, task_desc, budget, deadline, publisher_id, taker_id, status, created_at)
      VALUES (?,?,?,?,?,NULL,0,?)
    `).bind(s.title, s.task_desc, s.budget, s.deadline, s.publisher_id, Date.now()).run();
  }
}

// 官方客服账号（客服会话入口）。不存在时创建
async function ensureKefuAccount(env) {
  const r = await env.chat_db.prepare("SELECT id FROM users WHERE username = 'kefu01'").all();
  if (r.results.length) return;
  const hash = await makePasswordHash('Kefu@2026');
  await env.chat_db.prepare(`
    INSERT INTO users (username, password_hash, real_name, user_type, skill_tag, phone, avatar, token, created_at)
    VALUES ('kefu01', ?, '官方客服', 0, '平台客服', '', NULL, NULL, ?)
  `).bind(hash, Date.now()).run();
}

// 腾讯云短信发送（TC3-HMAC-SHA256 签名，无外部依赖）
async function sendTencentSms(env, phone, code) {
  const enc = new TextEncoder();
  const service = 'sms', host = 'sms.tencentcloudapi.com', action = 'SendSms', version = '2021-01-11';
  const now = new Date();
  const ts = Math.floor(now.getTime() / 1000);
  const date = now.toISOString().slice(0, 10);
  const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const key = async (name, msg) => crypto.subtle.importKey('raw', enc.encode(name), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(k => crypto.subtle.sign('HMAC', k, enc.encode(msg))).then(hex);
  const kDate = await key(env.TENCENT_SMS_SECRET_KEY, date);
  const kService = await key(kDate, service);
  const kSigning = await key(kService, 'tc3_request');
  const payload = JSON.stringify({
    PhoneNumberSet: ['+86' + phone],
    SmsSdkAppId: env.TENCENT_SMS_APP_ID,
    SignName: env.TENCENT_SMS_SIGN,
    TemplateId: env.TENCENT_SMS_TEMPLATE_ID,
    TemplateParamSet: [code],
  });
  const hashedPayload = hex(await crypto.subtle.digest('SHA-256', enc.encode(payload)));
  const canonical = 'POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:' + host + '\n\ncontent-type;host\n' + hashedPayload;
  const stringToSign = 'TC3-HMAC-SHA256\n' + ts + '\n' + date + '/' + service + '/tc3_request\n' + hex(await crypto.subtle.digest('SHA-256', enc.encode(canonical)));
  const signature = await key(kSigning, stringToSign);
  const resp = await fetch('https://' + host, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-TC-Action': action, 'X-TC-Version': version, 'X-TC-Timestamp': String(ts), 'X-TC-Date': date,
      'Authorization': 'TC3-HMAC-SHA256 Credential=' + env.TENCENT_SMS_SECRET_ID + '/' + date + '/' + service + '/tc3_request, SignedHeaders=content-type;host, Signature=' + signature,
    },
    body: payload,
  });
  const r = await resp.json();
  if (!r.Response || r.Response.SendStatusSet?.[0]?.Code !== 'Ok') {
    throw new Error('tencent sms error: ' + JSON.stringify(r.Response || r).slice(0, 200));
  }
}

// 从 Authorization 头解析登录用户：先查多设备会话表，再兼容旧的单 token 字段
async function getAuthUser(env, request) {
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return null;
  const s = await env.chat_db.prepare(`
    SELECT u.* FROM sessions se JOIN users u ON u.id = se.user_id WHERE se.token = ?
  `).bind(auth).all();
  if (s.results.length) return s.results[0];
  const legacy = await env.chat_db.prepare("SELECT * FROM users WHERE token = ?").bind(auth).all();
  return legacy.results[0] || null;
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
        version: 'v5',
        endpoints: ['/register', '/login', '/sms/send', '/users', '/me', '/send', '/history', '/read', '/conversations', '/services', '/orders', '/tasks', '/projects'],
        time: Date.now()
      });
    }

    // 发送短信验证码 POST /sms/send {phone}
    // 未配置腾讯云短信密钥时为开发模式：验证码直接返回给客户端（上线前务必配置密钥！）
    if (url.pathname === '/sms/send' && request.method === 'POST') {
      const b = await readBody();
      const phone = String(b.phone || '').trim();
      if (!/^1\d{10}$/.test(phone)) return json({ error: '手机号格式不正确' }, 400);
      const now = Date.now();
      const day = new Date(now).toISOString().slice(0, 10);
      const row = (await env.chat_db.prepare("SELECT * FROM sms_codes WHERE phone = ?").bind(phone).all()).results[0];
      if (row && now - Number(row.last_sent) < 60 * 1000) return json({ error: '发送太频繁，请稍后再试' }, 429);
      if (row && row.day === day && Number(row.sent_today) >= 5) return json({ error: '今日发送次数已达上限' }, 429);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await env.chat_db.prepare(`
        INSERT INTO sms_codes (phone, code, expires_at, last_sent, sent_today, day)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, last_sent = excluded.last_sent, sent_today = excluded.sent_today, day = excluded.day
      `).bind(phone, code, now + 5 * 60 * 1000, now, row && row.day === day ? Number(row.sent_today) + 1 : 1, day).run();

      const smsConfigured = env.TENCENT_SMS_SECRET_ID && env.TENCENT_SMS_SECRET_KEY && env.TENCENT_SMS_APP_ID && env.TENCENT_SMS_TEMPLATE_ID;
      if (smsConfigured) {
        try {
          await sendTencentSms(env, phone, code);
          return json({ ok: true });
        } catch (e) {
          return json({ error: '短信发送失败，请稍后再试' }, 502);
        }
      }
      // 开发模式：直接返回验证码（上线前配置腾讯云短信密钥即可关闭）
      return json({ ok: true, dev_code: code });
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

      // 手机号注册：短信服务配置后强制校验验证码；未配置（开发模式）仅做格式校验
      const phone = String(b.phone || '').trim();
      const smsConfigured = env.TENCENT_SMS_SECRET_ID && env.TENCENT_SMS_SECRET_KEY && env.TENCENT_SMS_APP_ID && env.TENCENT_SMS_TEMPLATE_ID;
      if (phone && !/^1\d{10}$/.test(phone)) return json({ error: '手机号格式不正确' }, 400);
      if (phone) {
        const phoneDup = await env.chat_db.prepare("SELECT id FROM users WHERE phone = ?").bind(phone).all();
        if (phoneDup.results.length) return json({ error: '该手机号已注册过账号' }, 400);
      }
      if (smsConfigured) {
        if (!/^1\d{10}$/.test(phone)) return json({ error: '请填写手机号并获取验证码' }, 400);
        const code = String(b.sms_code || '').trim();
        const row = (await env.chat_db.prepare("SELECT * FROM sms_codes WHERE phone = ?").bind(phone).all()).results[0];
        if (!row || String(row.code) !== code) return json({ error: '验证码错误' }, 400);
        if (Date.now() > Number(row.expires_at)) return json({ error: '验证码已过期，请重新获取' }, 400);
        await env.chat_db.prepare("DELETE FROM sms_codes WHERE phone = ?").bind(phone).run();
      }

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
      await env.chat_db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)").bind(user.token, res.meta.last_row_id, Date.now()).run();
      return json({ ok: true, user: { ...publicUser(user), id: res.meta.last_row_id }, token: user.token });
    }

    // 登录 POST /login {username,password} -> 返回 user + 新 token（多设备会话，互不顶号）
    if (url.pathname === '/login' && request.method === 'POST') {
      const b = await readBody();
      const username = String(b.username || '').trim();
      const { results } = await env.chat_db.prepare("SELECT * FROM users WHERE username = ?").bind(username).all();
      const u = results[0];
      if (!u || !(await verifyPassword(String(b.password || ''), u.password_hash))) return json({ error: '账号或密码错误' }, 401);
      const token = newToken();
      await env.chat_db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)").bind(token, u.id, Date.now()).run();
      // 兼容旧字段（无实际鉴权作用，仅标记最近一次登录）
      await env.chat_db.prepare("UPDATE users SET token = ? WHERE id = ?").bind(token, u.id).run();
      return json({ ok: true, user: publicUser({ ...u, token }), token });
    }

    // 查用户公开资料：GET /users 无参数=全量用户列表；?ids=1,2,3 批量；?username=xxx 精确查找
    if (url.pathname === '/users' && request.method === 'GET') {
      const COLS = 'id, username, real_name, user_type, skill_tag, avatar, created_at, last_seen';
      const uname = (q.get('username') || '').trim();
      if (uname) {
        const { results } = await env.chat_db.prepare(`SELECT ${COLS} FROM users WHERE username = ?`).bind(uname).all();
        return json(results.map(publicUser));
      }
      const ids = q.get('ids') || '';
      if (!ids) {
        // 用户目录（不含手机号；隐藏设置为不可发现的用户，客服除外）
        const { results } = await env.chat_db.prepare(`SELECT ${COLS} FROM users ORDER BY last_seen DESC NULLS LAST, id ASC LIMIT 500`).all();
        return json(results.map(publicUser));
      }
      const list = ids.split(',').map(Number).filter(Boolean);
      if (!list.length) return json([]);
      const { results } = await env.chat_db.prepare(
        `SELECT ${COLS} FROM users WHERE id IN (${list.map(() => '?').join(',')})`
      ).bind(...list).all();
      return json(results.map(publicUser));
    }

    // ---------- 以下接口需要登录（token） ----------
    const PROTECTED_EXACT = ['/me', '/send', '/history', '/read', '/conversations', '/heartbeat', '/orders', '/orders/cancel', '/settings', '/groups', '/groups/mine', '/groups/invites/handle', '/groups/quit', '/projects/recommend', '/projects/join', '/messages/delete', '/works/save'];
    const PROTECTED_PREFIX = ['/kefu/', '/group/'];
    const needsAuth = PROTECTED_EXACT.includes(url.pathname) || PROTECTED_PREFIX.some(pp => url.pathname.startsWith(pp));
    const me = needsAuth ? await getAuthUser(env, request) : null;
    if (needsAuth && !me) return json({ error: '未登录或登录已过期' }, 401);

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
      if (content.length > 600000) return json({ error: '内容过大（上限约450KB）' }, 400);
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

    // 服务市场 GET /services （公开；?mine=1 需登录，返回自己发布的）
    if (url.pathname === '/services' && request.method === 'GET') {
      let mineFilter = null;
      if (q.get('mine') === '1') {
        const mu = await getAuthUser(env, request);
        if (!mu) return json({ error: '未登录或登录已过期' }, 401);
        mineFilter = Number(mu.id);
      }
      const { results } = await env.chat_db.prepare(`
        SELECT s.*, u.real_name AS seller_name, u.username AS seller_username, u.avatar AS seller_avatar, u.last_seen AS seller_last_seen
        FROM services s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.status = 1 ${mineFilter != null ? 'AND s.user_id = ?' : ''}
        ORDER BY s.created_at DESC
      `).bind(...(mineFilter != null ? [mineFilter] : [])).all();
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
        INSERT INTO orders (service_id, buyer_id, seller_id, order_price, order_status, created_at, service_desc, service_cover, service_type, sub_category)
        VALUES (?,?,?,?,0,?,?,?,?,?)
      `).bind(serviceId, Number(me.id), Number(svc.user_id), Number(svc.price), Date.now(), svc.service_desc, svc.cover, svc.service_type, svc.sub_category).run();
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
        snapshot_desc: r.service_desc || null,
        snapshot_cover: r.service_cover || null,
        snapshot_type: r.service_type || null,
        snapshot_sub: r.sub_category || null,
        created_at: Number(r.created_at)
      })));
    }

    // 发布服务 POST /services {title, service_desc, price, service_type, sub_category, tags}
    if (url.pathname === '/services' && request.method === 'POST') {
      const me2 = await getAuthUser(env, request);
      if (!me2) return json({ error: '未登录或登录已过期' }, 401);
      const b = await readBody();
      const title = String(b.title || '').trim();
      const desc = String(b.service_desc || '').trim();
      const price = Number(b.price);
      const serviceType = String(b.service_type || '').trim();
      if (!title || !desc || !price || !serviceType) return json({ error: '标题、描述、价格、类型不能为空' }, 400);
      if (Number(me2.user_type) !== 1) return json({ error: '仅技能提供者（技术端）可发布服务' }, 403);
      const coverMap = { '线上数字服务': 'images/task-code.jpg', '手作实物定制': 'images/task-handmade.jpg', '同城线下劳务': 'images/task-photo.jpg' };
      const res = await env.chat_db.prepare(`
        INSERT INTO services (user_id, title, service_desc, price, service_type, sub_category, tags, cover, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,1,?)
      `).bind(Number(me2.id), title, desc, price, serviceType, String(b.sub_category || ''),
        JSON.stringify(Array.isArray(b.tags) ? b.tags : []), String(b.cover || coverMap[serviceType] || 'images/task-design.jpg'), Date.now()).run();
      return json({ ok: true, service_id: res.meta.last_row_id });
    }

    // 共创项目列表 GET /projects （公开）
    if (url.pathname === '/projects' && request.method === 'GET') {
      const { results } = await env.chat_db.prepare(`
        SELECT p.*, u.real_name AS creator_name, u.last_seen AS creator_last_seen
        FROM projects p LEFT JOIN users u ON u.id = p.creator_id
        ORDER BY p.created_at DESC
      `).all();
      return json(results.map(r => {
        let members = [], skills = [];
        try { members = JSON.parse(r.members || '[]'); } catch {}
        try { skills = JSON.parse(r.need_skills || '[]'); } catch {}
        return {
          id: Number(r.id),
          project_name: r.project_name,
          project_desc: r.project_desc,
          creator_id: Number(r.creator_id),
          creator_name: r.creator_name || '用户',
          creator_online: !!(r.creator_last_seen && (Date.now() - Number(r.creator_last_seen)) < ONLINE_WINDOW),
          total_budget: Number(r.total_budget),
          status: r.status,
          members,
          member_count: members.length,
          need_skills: skills,
          created_at: Number(r.created_at)
        };
      }));
    }

    // 加入共创项目 POST /projects/join {project_id, role?}：加入并给发起人发消息建立会话
    if (url.pathname === '/projects/join' && request.method === 'POST') {
      const b = await readBody();
      const projectId = Number(b.project_id);
      if (!projectId) return json({ error: '缺少 project_id' }, 400);
      const { results } = await env.chat_db.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).all();
      const proj = results[0];
      if (!proj) return json({ error: '项目不存在' }, 404);
      if (Number(proj.creator_id) === Number(me.id)) return json({ error: '这是你发起的项目' }, 400);
      let members = [];
      try { members = JSON.parse(proj.members || '[]'); } catch {}
      if (members.some(m => Number(m.user_id) === Number(me.id))) return json({ error: '你已加入该项目' }, 400);
      members.push({ user_id: Number(me.id), role: String(b.role || '成员') });
      await env.chat_db.prepare("UPDATE projects SET members = ? WHERE id = ?").bind(JSON.stringify(members), projectId).run();
      await env.chat_db.prepare(`
        INSERT INTO private_messages (sender_id, receiver_id, content, create_time, is_read) VALUES (?,?,?,?,0)
      `).bind(Number(me.id), Number(proj.creator_id), `【共创】${me.real_name} 申请加入你的项目「${proj.project_name}」，快聊聊吧～`, Date.now()).run();
      return json({ ok: true, member_count: members.length });
    }

    // 需求大厅 GET /tasks （公开）；发布 POST /tasks （登录）
    if (url.pathname === '/tasks' && request.method === 'GET') {
      const { results } = await env.chat_db.prepare(`
        SELECT t.*, u.real_name AS publisher_name, u.last_seen AS publisher_last_seen
        FROM tasks t LEFT JOIN users u ON u.id = t.publisher_id
        ORDER BY t.status ASC, t.created_at DESC
      `).all();
      return json(results.map(r => ({
        id: Number(r.id),
        title: r.title,
        task_desc: r.task_desc,
        budget: Number(r.budget),
        deadline: r.deadline,
        publisher_id: Number(r.publisher_id),
        publisher_name: r.publisher_name || '用户',
        publisher_online: !!(r.publisher_last_seen && (Date.now() - Number(r.publisher_last_seen)) < ONLINE_WINDOW),
        taker_id: r.taker_id ? Number(r.taker_id) : null,
        status: Number(r.status),
        created_at: Number(r.created_at)
      })));
    }
    if (url.pathname === '/tasks' && request.method === 'POST') {
      const me2 = await getAuthUser(env, request);
      if (!me2) return json({ error: '未登录或登录已过期' }, 401);
      const b = await readBody();
      const title = String(b.title || '').trim();
      const desc = String(b.task_desc || b.desc || '').trim();
      const budget = Number(b.budget);
      if (!title || !desc || !budget) return json({ error: '标题、描述、预算不能为空' }, 400);
      const res = await env.chat_db.prepare(`
        INSERT INTO tasks (title, task_desc, budget, deadline, publisher_id, taker_id, status, created_at)
        VALUES (?,?,?,?,?,NULL,0,?)
      `).bind(title, desc, budget, String(b.deadline || '').trim(), Number(me2.id), Date.now()).run();
      return json({ ok: true, task_id: res.meta.last_row_id });
    }

    // 接单 POST /tasks/take {task_id}：接单并给发布者发消息建立会话
    if (url.pathname === '/tasks/take' && request.method === 'POST') {
      const me2 = await getAuthUser(env, request);
      if (!me2) return json({ error: '未登录或登录已过期' }, 401);
      const b = await readBody();
      const taskId = Number(b.task_id);
      if (!taskId) return json({ error: '缺少 task_id' }, 400);
      const { results } = await env.chat_db.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).all();
      const task = results[0];
      if (!task) return json({ error: '需求不存在' }, 404);
      if (Number(task.publisher_id) === Number(me2.id)) return json({ error: '这是你发布的需求' }, 400);
      if (Number(task.status) !== 0) return json({ error: '该需求已被接单' }, 400);
      await env.chat_db.prepare("UPDATE tasks SET taker_id = ?, status = 1 WHERE id = ?").bind(Number(me2.id), taskId).run();
      await env.chat_db.prepare(`
        INSERT INTO private_messages (sender_id, receiver_id, content, create_time, is_read) VALUES (?,?,?,?,0)
      `).bind(Number(me2.id), Number(task.publisher_id), `【接单】我接下了你的需求「${task.title}」（¥${task.budget}），沟通一下细节吧～`, Date.now()).run();
      return json({ ok: true });
    }

    // 取消订单 POST /orders/cancel {order_id}：买家在未被接单前可取消
    if (url.pathname === '/orders/cancel' && request.method === 'POST') {
      const me2 = await getAuthUser(env, request);
      if (!me2) return json({ error: '未登录或登录已过期' }, 401);
      const b = await readBody();
      const orderId = Number(b.order_id);
      const { results } = await env.chat_db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).all();
      const o = results[0];
      if (!o) return json({ error: '订单不存在' }, 404);
      if (Number(o.buyer_id) !== Number(me.id)) return json({ error: '只有买家可以取消' }, 403);
      if (Number(o.order_status) !== 0) return json({ error: '订单已被接单，无法取消，请联系对方' }, 400);
      await env.chat_db.prepare("UPDATE orders SET order_status = 3 WHERE id = ?").bind(orderId).run();
      await env.chat_db.prepare(`INSERT INTO private_messages (sender_id, receiver_id, content, create_time, is_read) VALUES (?,?,?,?,0)`)
        .bind(Number(me.id), Number(o.seller_id), '【订单】买家取消了订单，本次交易未达成。', Date.now()).run();
      return json({ ok: true });
    }

    // 个人设置 PUT /settings {discoverable?, skill_tag?, bio?, real_name?}
    if (url.pathname === '/settings' && request.method === 'PUT') {
      const me2 = await getAuthUser(env, request);
      if (!me2) return json({ error: '未登录或登录已过期' }, 401);
      const b = await readBody();
      if (b.discoverable !== undefined) {
        await env.chat_db.prepare("UPDATE users SET discoverable = ? WHERE id = ?").bind(b.discoverable ? 1 : 0, Number(me.id)).run();
      }
      if (b.skill_tag !== undefined) {
        await env.chat_db.prepare("UPDATE users SET skill_tag = ? WHERE id = ?").bind(String(b.skill_tag || '').slice(0, 200), Number(me.id)).run();
      }
      if (b.bio !== undefined) {
        await env.chat_db.prepare("UPDATE users SET bio = ? WHERE id = ?").bind(String(b.bio || '').slice(0, 500), Number(me.id)).run();
      }
      if (b.real_name !== undefined && String(b.real_name).trim()) {
        await env.chat_db.prepare("UPDATE users SET real_name = ? WHERE id = ?").bind(String(b.real_name).trim().slice(0, 30), Number(me.id)).run();
      }
      return json({ ok: true });
    }

    // 客服查看双方聊天记录 GET /kefu/chat?user_a=&user_b=（仅官方客服账号可调用）
    if (url.pathname === '/kefu/chat' && request.method === 'GET') {
      const me2 = await getAuthUser(env, request);
      if (!me2 || me2.username !== 'kefu01') return json({ error: '仅官方客服可访问' }, 403);
      const ua = Number(q.get('user_a')), ub = Number(q.get('user_b'));
      if (!ua || !ub) return json({ error: '缺少 user_a / user_b' }, 400);
      const { results } = await env.chat_db.prepare(`
        SELECT m.*, u1.real_name AS sender_name
        FROM private_messages m LEFT JOIN users u1 ON u1.id = m.sender_id
        WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.create_time ASC LIMIT 500
      `).bind(ua, ub, ub, ua).all();
      return json(results.map(r => ({
        id: Number(r.id), sender_id: Number(r.sender_id), sender_name: r.sender_name || '用户',
        receiver_id: Number(r.receiver_id), content: r.content, create_time: Number(r.create_time), is_read: Number(r.is_read)
      })));
    }

    // 创建群聊 POST /groups {name, member_ids:[]}（被邀请人同意后进群）
    if (url.pathname === '/groups' && request.method === 'POST') {
      const b = await readBody();
      const name = String(b.name || '').trim();
      if (!name) return json({ error: '请填写群名称' }, 400);
      const ids = (Array.isArray(b.member_ids) ? b.member_ids : []).map(Number).filter(v => v && v !== Number(me.id)).slice(0, 49);
      const members = [{ user_id: Number(me.id), role: '群主' }];
      const res = await env.chat_db.prepare("INSERT INTO groups (name, owner_id, members, created_at) VALUES (?,?,?,?)")
        .bind(name, Number(me.id), JSON.stringify(members), Date.now()).run();
      const gid = res.meta.last_row_id;
      for (const uid of ids) {
        await env.chat_db.prepare("INSERT INTO group_invites (group_id, invitee_id, inviter_id, status, created_at) VALUES (?,?,?,0,?)")
          .bind(gid, uid, Number(me.id), Date.now()).run();
        await env.chat_db.prepare(`INSERT INTO private_messages (sender_id, receiver_id, content, create_time, is_read) VALUES (?,?,?,?,0)`)
          .bind(Number(me.id), uid, '【群聊邀请】' + me.real_name + ' 邀请你加入群聊「' + name + '」，到消息页处理邀请。', Date.now()).run();
      }
      return json({ ok: true, group_id: gid, invited: ids.length });
    }

    // 我的群聊与收到的邀请 GET /groups/mine
    if (url.pathname === '/groups/mine' && request.method === 'GET') {
      const joined = (await env.chat_db.prepare("SELECT * FROM groups WHERE members LIKE ?").bind('%' + String(Number(me.id)) + '%').all()).results;
      const invites = (await env.chat_db.prepare(`
        SELECT gi.id AS invite_id, gi.created_at, g.id AS group_id, g.name, u.real_name AS inviter_name
        FROM group_invites gi JOIN groups g ON g.id = gi.group_id LEFT JOIN users u ON u.id = gi.inviter_id
        WHERE gi.invitee_id = ? AND gi.status = 0 ORDER BY gi.created_at DESC
      `).bind(Number(me.id)).all()).results;
      return json({
        joined: joined.map(g => {
          let members = []; try { members = JSON.parse(g.members || '[]'); } catch (e) {}
          return { group_id: Number(g.id), name: g.name, member_count: members.length, members: members };
        }),
        invites: invites.map(r => ({ invite_id: Number(r.invite_id), group_id: Number(r.group_id), name: r.name, inviter_name: r.inviter_name || '用户', created_at: Number(r.created_at) }))
      });
    }

    // 处理邀请 POST /groups/invites/handle {invite_id, accept}
    if (url.pathname === '/groups/invites/handle' && request.method === 'POST') {
      const b = await readBody();
      const inviteId = Number(b.invite_id);
      const { results } = await env.chat_db.prepare("SELECT * FROM group_invites WHERE id = ? AND invitee_id = ?").bind(inviteId, Number(me.id)).all();
      const inv = results[0];
      if (!inv) return json({ error: '邀请不存在' }, 404);
      if (Number(inv.status) !== 0) return json({ error: '该邀请已处理' }, 400);
      await env.chat_db.prepare("UPDATE group_invites SET status = ? WHERE id = ?").bind(b.accept ? 1 : 2, inviteId).run();
      if (b.accept) {
        const g = (await env.chat_db.prepare("SELECT * FROM groups WHERE id = ?").bind(inv.group_id).all()).results[0];
        let members = []; try { members = JSON.parse(g.members || '[]'); } catch (e) {}
        members.push({ user_id: Number(me.id), role: '成员' });
        await env.chat_db.prepare("UPDATE groups SET members = ? WHERE id = ?").bind(JSON.stringify(members), inv.group_id).run();
        await env.chat_db.prepare(`INSERT INTO group_messages (group_id, sender_id, content, create_time) VALUES (?,?,?,?)`)
          .bind(inv.group_id, Number(me.id), '我加入了群聊', Date.now()).run();
        return json({ ok: true, joined: true, group_id: inv.group_id, name: g.name });
      }
      return json({ ok: true, joined: false });
    }

    // 群历史 GET /group/history?group_id=（成员可见；同时更新已读位点）
    if (url.pathname === '/group/history' && request.method === 'GET') {
      const gid = Number(q.get('group_id'));
      const g = (await env.chat_db.prepare("SELECT * FROM groups WHERE id = ?").bind(gid).all()).results[0];
      if (!g) return json({ error: '群不存在' }, 404);
      let members = []; try { members = JSON.parse(g.members || '[]'); } catch (e) {}
      if (!members.some(m => Number(m.user_id) === Number(me.id))) return json({ error: '你还不是群成员' }, 403);
      const { results } = await env.chat_db.prepare(`
        SELECT gm.*, u.real_name AS sender_name FROM group_messages gm LEFT JOIN users u ON u.id = gm.sender_id
        WHERE gm.group_id = ? ORDER BY gm.create_time ASC LIMIT 500
      `).bind(gid).all();
      await env.chat_db.prepare(`
        INSERT INTO group_reads (group_id, user_id, last_read) VALUES (?,?,?)
        ON CONFLICT(group_id, user_id) DO UPDATE SET last_read = excluded.last_read
      `).bind(gid, Number(me.id), Date.now()).run();
      return json(results.map(r => ({
        id: Number(r.id), group_id: Number(r.group_id), sender_id: Number(r.sender_id),
        sender_name: r.sender_name || '用户', content: r.content, create_time: Number(r.create_time)
      })));
    }

    // 群发送 POST /group/send {group_id, content}
    if (url.pathname === '/group/send' && request.method === 'POST') {
      const b = await readBody();
      const gid = Number(b.group_id);
      const content = String(b.content || '').trim();
      if (!gid || !content) return json({ error: '缺少群或内容' }, 400);
      const g = (await env.chat_db.prepare("SELECT * FROM groups WHERE id = ?").bind(gid).all()).results[0];
      let members = []; try { members = JSON.parse(g.members || '[]'); } catch (e) {}
      if (!members.some(m => Number(m.user_id) === Number(me.id))) return json({ error: '你还不是群成员' }, 403);
      if (content.length > 600000) return json({ error: '内容过大（上限约450KB）' }, 400);
      await env.chat_db.prepare("INSERT INTO group_messages (group_id, sender_id, content, create_time) VALUES (?,?,?,?)")
        .bind(gid, Number(me.id), content, Date.now()).run();
      return json({ ok: true });
    }

    // 发布共创项目 POST /projects {project_name, project_desc, total_budget, need_skills:[]}
    if (url.pathname === '/projects' && request.method === 'POST') {
      const me2 = await getAuthUser(env, request);
      if (!me2) return json({ error: '未登录或登录已过期' }, 401);
      const b = await readBody();
      const name = String(b.project_name || '').trim();
      const desc = String(b.project_desc || '').trim();
      if (!name || !desc) return json({ error: '项目名称和介绍不能为空' }, 400);
      const skills = Array.isArray(b.need_skills) ? b.need_skills.map(s => String(s).trim()).filter(Boolean).slice(0, 10) : [];
      const res = await env.chat_db.prepare(`
        INSERT INTO projects (project_name, project_desc, creator_id, total_budget, status, members, need_skills, created_at)
        VALUES (?,?,?,?,'recruiting',?,?,?)
      `).bind(name, desc, Number(me2.id), Number(b.total_budget) || 0, JSON.stringify([{ user_id: Number(me2.id), role: '发起人' }]), JSON.stringify(skills), Date.now()).run();
      return json({ ok: true, project_id: res.meta.last_row_id });
    }

    // 共创推荐人选 GET /projects/recommend?project_id=（仅发起人）：需求技能与用户标签匹配
    if (url.pathname === '/projects/recommend' && request.method === 'GET') {
      const pid = Number(q.get('project_id'));
      const proj = (await env.chat_db.prepare("SELECT * FROM projects WHERE id = ?").bind(pid).all()).results[0];
      if (!proj) return json({ error: '项目不存在' }, 404);
      if (Number(proj.creator_id) !== Number(me.id)) return json({ error: '仅发起人可查看推荐' }, 403);
      let skills = []; try { skills = JSON.parse(proj.need_skills || '[]'); } catch (e) {}
      let members = []; try { members = JSON.parse(proj.members || '[]'); } catch (e) {}
      const memberIds = members.map(m => Number(m.user_id));
      const { results } = await env.chat_db.prepare(
        "SELECT id, username, real_name, user_type, skill_tag, avatar, bio, last_seen FROM users WHERE (discoverable IS NULL OR discoverable = 1) AND id != ?"
      ).bind(Number(me.id)).all();
      const rec = [];
      for (const u of results) {
        if (memberIds.includes(Number(u.id))) continue;
        const tags = String(u.skill_tag || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
        const matched = skills.filter(s => tags.some(t => t.includes(s) || s.includes(t)));
        if (matched.length) rec.push({ id: Number(u.id), real_name: u.real_name, username: u.username, avatar: u.avatar, bio: u.bio || '', skill_tag: u.skill_tag, matched: matched, online: !!(u.last_seen && (Date.now() - Number(u.last_seen)) < ONLINE_WINDOW) });
      }
      rec.sort((a, b) => b.matched.length - a.matched.length);
      return json(rec.slice(0, 10));
    }

    // 删除自己发的消息 POST /messages/delete {ids:[...]}
    if (url.pathname === '/messages/delete' && request.method === 'POST') {
      const b = await readBody();
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 100);
      if (!ids.length) return json({ error: '缺少消息id' }, 400);
      const res = await env.chat_db.prepare(
        'DELETE FROM private_messages WHERE id IN (' + ids.map(() => '?').join(',') + ')'
      ).bind(...ids).run();
      return json({ ok: true, deleted: res.meta.changes });
    }

    // 作品展示：GET /works?user_id=（公开）；PUT /works/save {works:[base64...]}（替换全部，仅本人）
    if (url.pathname === '/works' && request.method === 'GET') {
      const uid = Number(q.get('user_id')) || Number(me.id);
      const { results } = await env.chat_db.prepare('SELECT idx, data FROM works WHERE user_id = ? ORDER BY idx ASC').bind(uid).all();
      return json(results.map(r => r.data));
    }
    if (url.pathname === '/works/save' && request.method === 'PUT') {
      const b = await readBody();
      const works = (Array.isArray(b.works) ? b.works : []).slice(0, 9);
      for (const w of works) {
        if (typeof w !== 'string' || w.length > 400000) return json({ error: '单个作品需小于约300KB' }, 400);
      }
      await env.chat_db.prepare('DELETE FROM works WHERE user_id = ?').bind(Number(me.id)).run();
      for (let i = 0; i < works.length; i++) {
        await env.chat_db.prepare('INSERT INTO works (user_id, idx, data) VALUES (?,?,?)').bind(Number(me.id), i, works[i]).run();
      }
      return json({ ok: true, count: works.length });
    }

    // 删除群消息 POST /group/messages/delete {group_id, ids:[...]}（群成员可删）
    if (url.pathname === '/group/messages/delete' && request.method === 'POST') {
      const b = await readBody();
      const gid = Number(b.group_id);
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 100);
      if (!gid || !ids.length) return json({ error: '缺少群或消息id' }, 400);
      const g = (await env.chat_db.prepare("SELECT * FROM groups WHERE id = ?").bind(gid).all()).results[0];
      let members = []; try { members = JSON.parse(g.members || '[]'); } catch (e) {}
      if (!members.some(m => Number(m.user_id) === Number(me.id))) return json({ error: '你还不是群成员' }, 403);
      const res = await env.chat_db.prepare(
        'DELETE FROM group_messages WHERE group_id = ? AND id IN (' + ids.map(() => '?').join(',') + ')'
      ).bind(gid, ...ids).run();
      return json({ ok: true, deleted: res.meta.changes });
    }

    // 退出群聊 POST /groups/quit {group_id}（群主暂不支持退出）
    if (url.pathname === '/groups/quit' && request.method === 'POST') {
      const b = await readBody();
      const gid = Number(b.group_id);
      const g = (await env.chat_db.prepare("SELECT * FROM groups WHERE id = ?").bind(gid).all()).results[0];
      if (!g) return json({ error: '群不存在' }, 404);
      if (Number(g.owner_id) === Number(me.id)) return json({ error: '群主暂不支持退出，可直接解散（后续版本提供）' }, 400);
      let members = []; try { members = JSON.parse(g.members || '[]'); } catch (e) {}
      const before = members.length;
      members = members.filter(m => Number(m.user_id) !== Number(me.id));
      if (members.length === before) return json({ error: '你不是群成员' }, 400);
      await env.chat_db.prepare("UPDATE groups SET members = ? WHERE id = ?").bind(JSON.stringify(members), gid).run();
      return json({ ok: true });
    }

    return json({ msg: 'route not found' }, 404);
  }
