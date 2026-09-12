import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");

if (dbPath !== ":memory:") {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    password_hash TEXT NOT NULL,
    deleted_at DATETIME,
    purge_after DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    resume TEXT NOT NULL,
    job_title TEXT NOT NULL,
    job_description TEXT DEFAULT '',
    score REAL,
    report TEXT,
    job_url TEXT DEFAULT '',
    person_key TEXT,
    person_name TEXT,
    cache_key TEXT,
    candidate_type TEXT DEFAULT 'general',
    objective_json TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    favorite INTEGER NOT NULL DEFAULT 0,
    share_token TEXT,
    share_hide_contact INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS usage_log (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    title TEXT DEFAULT '',
    format TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id)");

// JD 关键词缓存（LLM 抽取结果，按 JD 文本哈希去重，避免重复调用）
db.exec(`
  CREATE TABLE IF NOT EXISTS jd_keywords (
    hash TEXT PRIMARY KEY,
    keywords TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 游客试用额度（按 IP + 天 计数，注册前可免注册试用 N 次）
db.exec(`
  CREATE TABLE IF NOT EXISTS guest_trials (
    ip TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ip, day)
  )
`);

// 最小埋点事件（注册/首次评估/报告读完/追问/下载/7日回访）
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    meta TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at)");
db.exec("CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id)");

// 站内反馈与轻量投票（结果页「评分是否有帮助」）
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    kind TEXT NOT NULL,
    rating TEXT DEFAULT '',
    content TEXT DEFAULT '',
    context TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_feedback_kind ON feedback(kind, created_at)");

// 兼容旧库：补上新增字段
const columns = db.prepare("PRAGMA table_info(evaluations)").all().map((c) => c.name);
if (!columns.includes("person_key")) db.exec("ALTER TABLE evaluations ADD COLUMN person_key TEXT");
if (!columns.includes("person_name")) db.exec("ALTER TABLE evaluations ADD COLUMN person_name TEXT");
if (!columns.includes("job_url")) db.exec("ALTER TABLE evaluations ADD COLUMN job_url TEXT DEFAULT ''");
if (!columns.includes("user_id")) db.exec("ALTER TABLE evaluations ADD COLUMN user_id INTEGER");
if (!columns.includes("cache_key")) db.exec("ALTER TABLE evaluations ADD COLUMN cache_key TEXT");
if (!columns.includes("candidate_type")) {
  db.exec("ALTER TABLE evaluations ADD COLUMN candidate_type TEXT DEFAULT 'general'");
}
if (!columns.includes("objective_json")) {
  db.exec("ALTER TABLE evaluations ADD COLUMN objective_json TEXT");
}
if (!columns.includes("revision")) {
  db.exec("ALTER TABLE evaluations ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
}
if (!columns.includes("favorite")) {
  db.exec("ALTER TABLE evaluations ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
}
if (!columns.includes("share_token")) {
  db.exec("ALTER TABLE evaluations ADD COLUMN share_token TEXT");
}
if (!columns.includes("share_hide_contact")) {
  db.exec("ALTER TABLE evaluations ADD COLUMN share_hide_contact INTEGER NOT NULL DEFAULT 0");
}

db.exec("CREATE INDEX IF NOT EXISTS idx_eval_person ON evaluations(person_key)");
db.exec("CREATE INDEX IF NOT EXISTS idx_eval_user ON evaluations(user_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_eval_cache ON evaluations(user_id, cache_key)");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_share ON evaluations(share_token) WHERE share_token IS NOT NULL");

// 兼容旧库：users 补上 username / role
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes("username")) db.exec("ALTER TABLE users ADD COLUMN username TEXT");
if (!userColumns.includes("role")) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}
if (!userColumns.includes("deleted_at")) {
  db.exec("ALTER TABLE users ADD COLUMN deleted_at DATETIME");
}
if (!userColumns.includes("purge_after")) {
  db.exec("ALTER TABLE users ADD COLUMN purge_after DATETIME");
}
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL"
);

export default db;
