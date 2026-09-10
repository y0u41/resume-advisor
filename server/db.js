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
  CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume TEXT NOT NULL,
    job_title TEXT NOT NULL,
    job_description TEXT DEFAULT '',
    score REAL,
    report TEXT,
    job_url TEXT DEFAULT '',
    person_key TEXT,
    person_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 兼容旧库：补上新增字段
const columns = db.prepare("PRAGMA table_info(evaluations)").all().map((c) => c.name);
if (!columns.includes("person_key")) {
  db.exec("ALTER TABLE evaluations ADD COLUMN person_key TEXT");
}
if (!columns.includes("person_name")) {
  db.exec("ALTER TABLE evaluations ADD COLUMN person_name TEXT");
}
if (!columns.includes("job_url")) {
  db.exec("ALTER TABLE evaluations ADD COLUMN job_url TEXT DEFAULT ''");
}

db.exec("CREATE INDEX IF NOT EXISTS idx_eval_person ON evaluations(person_key)");

export default db;
