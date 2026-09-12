import fs from "fs";
import path from "path";
import db from "../core/db.js";

// SQLite 在线备份（better-sqlite3 原生 API，无需停服）。
// 数据全在单个 SQLite 文件（WAL 模式），简历属敏感数据，损坏 = 全部丢失，故每日备份。
function backupDir() {
  return process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
}

function keepCount() {
  return Number(process.env.BACKUP_KEEP || 7);
}

// 删除超出保留份数的旧备份（按文件名升序 = 按日期升序）
function pruneOld(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("app-") && f.endsWith(".db"))
    .sort();
  while (files.length > keepCount()) {
    fs.unlinkSync(path.join(dir, files.shift()));
  }
}

// 当天已有则跳过生成（但仍会执行保留策略）。返回备份文件路径。
export async function runBackup() {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `app-${new Date().toISOString().slice(0, 10)}.db`);
  if (!fs.existsSync(file)) {
    await db.backup(file);
    console.log(`[backup] 已备份数据库到 ${file}`);
  }
  pruneOld(dir);
  return file;
}

// 启动时先跑一次，之后每 24 小时一次
export function startBackupJob(intervalMs = 24 * 60 * 60 * 1000) {
  const safeRun = () => {
    runBackup().catch((error) => console.error("[backup] 失败:", error.message));
  };
  safeRun();
  const timer = setInterval(safeRun, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}
