-- ============================================================
-- 技能共享平台 D1 数据库初始化脚本（可选执行）
-- worker.js 首次运行时会自动执行同样的建表/索引，此文件仅供手动初始化参考
-- 执行方式：Cloudflare 控制台 -> D1 -> chat_db -> Console 粘贴执行
-- ============================================================

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
);

CREATE TABLE IF NOT EXISTS private_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  create_time INTEGER NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pm_pair ON private_messages(sender_id, receiver_id);
