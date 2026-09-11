import db from "../core/db.js";

// 物理删除冷静期已到期的账号及其全部数据（评估、额度记录）。
export function runPurge() {
  const due = db
    .prepare("SELECT id FROM users WHERE purge_after IS NOT NULL AND purge_after <= datetime('now')")
    .all();
  if (due.length === 0) return { purged: 0 };

  const delEvals = db.prepare("DELETE FROM evaluations WHERE user_id = ?");
  const delUsage = db.prepare("DELETE FROM usage_log WHERE user_id = ?");
  const delUser = db.prepare("DELETE FROM users WHERE id = ?");

  const tx = db.transaction((ids) => {
    for (const id of ids) {
      delEvals.run(id);
      delUsage.run(id);
      delUser.run(id);
    }
  });
  tx(due.map((r) => r.id));

  console.log(`[purge] 已物理删除 ${due.length} 个到期注销账号`);
  return { purged: due.length };
}

// 启动时执行一次，之后按间隔轮询（默认每 6 小时）。
export function startPurgeJob(intervalMs = 6 * 60 * 60 * 1000) {
  const safeRun = () => {
    try {
      runPurge();
    } catch (error) {
      console.error("[purge] 执行失败:", error.message);
    }
  };

  safeRun();
  const timer = setInterval(safeRun, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}
