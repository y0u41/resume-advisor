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

// ===== 数据库迁移（PRAGMA user_version 顺序回放）=====
//
// 改表结构的唯一方式：往 MIGRATIONS 数组【尾部】追加 { v: 上一个 v + 1, up: ... }。
// 不要修改历史迁移的内容——已上线的库不会重放它。
//
// 启动时读取 user_version，只执行 v > current 的迁移，每步在一个事务里执行并推进版本。
// 老库兼容：已有生产库（含全部列）跑 migrate 时，CREATE IF NOT EXISTS 无副作用、
// 守卫式 ALTER 全部跳过 → user_version 从 0 一次性推进到最新，数据完好。
// 因此不需要写"探测当前版本"的复杂逻辑。

function columnExists(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

export const MIGRATIONS = [
  {
    v: 1,
    up: () =>
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
      `),
  },
  {
    v: 2,
    up: () =>
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
          share_include_resume INTEGER NOT NULL DEFAULT 0,
          share_hide_name INTEGER NOT NULL DEFAULT 0,
          share_expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `),
  },
  {
    v: 3,
    up: () =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS usage_log (
          user_id INTEGER NOT NULL,
          day TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, day)
        )
      `),
  },
  {
    v: 4,
    // 分层额度计数（total=总次数 / premium=高级模型 / ocr=图片简历），按 plan 限流
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS quota_counters (
          user_id INTEGER NOT NULL,
          day TEXT NOT NULL,
          kind TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, day, kind)
        )
      `);
      // 兼容旧库：把 usage_log 的总次数迁移到 quota_counters
      try {
        const migrated = db
          .prepare("SELECT COUNT(*) c FROM quota_counters WHERE kind = 'total'")
          .get().c;
        const legacy = db.prepare("SELECT COUNT(*) c FROM usage_log").get().c;
        if (migrated === 0 && legacy > 0) {
          db.exec(
            "INSERT OR IGNORE INTO quota_counters (user_id, day, kind, count) SELECT user_id, day, 'total', count FROM usage_log"
          );
        }
      } catch {
        // 迁移失败不阻塞启动
      }
    },
  },
  {
    v: 5,
    up: () => {
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
    },
  },
  {
    v: 6,
    // JD 关键词缓存（LLM 抽取结果，按 JD 文本哈希去重）
    // 同时沉淀「岗位名 + 关键词」，作为可公开的岗位关键词库数据资产（见 core/keywordLibrary.js）
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS jd_keywords (
          hash TEXT PRIMARY KEY,
          keywords TEXT NOT NULL,
          job_title TEXT DEFAULT '',
          hits INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME
        )
      `);
      if (!columnExists("jd_keywords", "job_title"))
        db.exec("ALTER TABLE jd_keywords ADD COLUMN job_title TEXT DEFAULT ''");
      if (!columnExists("jd_keywords", "hits"))
        db.exec("ALTER TABLE jd_keywords ADD COLUMN hits INTEGER NOT NULL DEFAULT 0");
      if (!columnExists("jd_keywords", "updated_at"))
        db.exec("ALTER TABLE jd_keywords ADD COLUMN updated_at DATETIME");
    },
  },
  {
    v: 7,
    // 游客试用额度（按 IP + 天 计数，注册前可免注册试用 N 次）
    up: () =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS guest_trials (
          ip TEXT NOT NULL,
          day TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (ip, day)
        )
      `),
  },
  {
    v: 8,
    // 最小埋点事件（注册/首次评估/报告读完/追问/下载/7日回访）
    up: () => {
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
    },
  },
  {
    v: 9,
    // 站内反馈与轻量投票（结果页「评分是否有帮助」）
    up: () => {
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
    },
  },
  {
    v: 10,
    // LLM 调用用量（token 消耗，用于成本看板）
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS llm_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          feature TEXT NOT NULL DEFAULT 'unknown',
          model TEXT DEFAULT '',
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_usage_feature ON llm_usage(feature, created_at)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_usage_user ON llm_usage(user_id)");
    },
  },
  {
    v: 11,
    // PRO 开通申请（支付接入前的人工流程：用户申请 → 管理员批准即开通）
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pro_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          note TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          handled_at DATETIME
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_pro_requests_status ON pro_requests(status, id)");
      if (!columnExists("pro_requests", "pay_email")) {
        db.exec("ALTER TABLE pro_requests ADD COLUMN pay_email TEXT DEFAULT ''");
      }
    },
  },
  {
    v: 12,
    // 兼容旧库：evaluations 补上历史新增字段 + 索引
    up: () => {
      if (!columnExists("evaluations", "person_key"))
        db.exec("ALTER TABLE evaluations ADD COLUMN person_key TEXT");
      if (!columnExists("evaluations", "person_name"))
        db.exec("ALTER TABLE evaluations ADD COLUMN person_name TEXT");
      if (!columnExists("evaluations", "job_url"))
        db.exec("ALTER TABLE evaluations ADD COLUMN job_url TEXT DEFAULT ''");
      if (!columnExists("evaluations", "user_id"))
        db.exec("ALTER TABLE evaluations ADD COLUMN user_id INTEGER");
      if (!columnExists("evaluations", "cache_key"))
        db.exec("ALTER TABLE evaluations ADD COLUMN cache_key TEXT");
      if (!columnExists("evaluations", "candidate_type"))
        db.exec("ALTER TABLE evaluations ADD COLUMN candidate_type TEXT DEFAULT 'general'");
      if (!columnExists("evaluations", "objective_json"))
        db.exec("ALTER TABLE evaluations ADD COLUMN objective_json TEXT");
      if (!columnExists("evaluations", "revision"))
        db.exec("ALTER TABLE evaluations ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
      if (!columnExists("evaluations", "favorite"))
        db.exec("ALTER TABLE evaluations ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
      if (!columnExists("evaluations", "share_token"))
        db.exec("ALTER TABLE evaluations ADD COLUMN share_token TEXT");
      if (!columnExists("evaluations", "share_hide_contact"))
        db.exec("ALTER TABLE evaluations ADD COLUMN share_hide_contact INTEGER NOT NULL DEFAULT 0");
      if (!columnExists("evaluations", "share_include_resume"))
        db.exec("ALTER TABLE evaluations ADD COLUMN share_include_resume INTEGER NOT NULL DEFAULT 0");
      if (!columnExists("evaluations", "share_expires_at"))
        db.exec("ALTER TABLE evaluations ADD COLUMN share_expires_at DATETIME");
      if (!columnExists("evaluations", "share_hide_name"))
        db.exec("ALTER TABLE evaluations ADD COLUMN share_hide_name INTEGER NOT NULL DEFAULT 0");

      db.exec("CREATE INDEX IF NOT EXISTS idx_eval_person ON evaluations(person_key)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_eval_user ON evaluations(user_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_eval_cache ON evaluations(user_id, cache_key)");
      db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_share ON evaluations(share_token) WHERE share_token IS NOT NULL"
      );
    },
  },
  {
    v: 13,
    // 兼容旧库：users 补上 username/role/deleted_at/purge_after/plan/plan_expires_at + 唯一索引
    up: () => {
      if (!columnExists("users", "username")) db.exec("ALTER TABLE users ADD COLUMN username TEXT");
      if (!columnExists("users", "role"))
        db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
      if (!columnExists("users", "deleted_at"))
        db.exec("ALTER TABLE users ADD COLUMN deleted_at DATETIME");
      if (!columnExists("users", "purge_after"))
        db.exec("ALTER TABLE users ADD COLUMN purge_after DATETIME");
      // 套餐：free（默认）/ pro；管理员不受额度限制（见 core/plans.js）
      if (!columnExists("users", "plan"))
        db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
      // PRO 有效期：NULL = 永久；过期由 normalizePlan 自动回落 free（见 core/plans.js）
      if (!columnExists("users", "plan_expires_at"))
        db.exec("ALTER TABLE users ADD COLUMN plan_expires_at DATETIME");

      db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL"
      );
    },
  },
];

export function migrate() {
  const current = db.pragma("user_version", { simple: true });
  for (const m of MIGRATIONS) {
    if (m.v <= current) continue;
    db.transaction(() => {
      m.up();
      db.pragma(`user_version = ${m.v}`);
    })();
  }
}

migrate();

export default db;
