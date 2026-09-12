import db from "../core/db.js";

// 物理删除冷静期已到期的账号及其**全部**数据。
// 清理清单**自动发现**：扫描所有含 `user_id` 列的表（不再人工登记，新增表自动纳入，
// 避免"新表忘登记 → 注销后残留隐私数据"）。如需排除某张表，加入 EXCLUDED。
const EXCLUDED = new Set(["users"]); // 账号主表由 delUser 单独删除

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

// 返回所有含 user_id 列的表名（排除 EXCLUDED）。导出以便测试与一致性校验。
export function tablesWithUserId() {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);

  const result = [];
  for (const t of tables) {
    if (EXCLUDED.has(t)) continue;
    const cols = db.prepare(`PRAGMA table_info(${quoteIdent(t)})`).all();
    if (cols.some((c) => c.name === "user_id")) result.push(t);
  }
  return result;
}

export function runPurge() {
  const due = db
    .prepare("SELECT id FROM users WHERE purge_after IS NOT NULL AND purge_after <= datetime('now')")
    .all();
  if (due.length === 0) return { purged: 0 };

  const tables = tablesWithUserId();
  const deleteStmts = tables.map((table) =>
    db.prepare(`DELETE FROM ${quoteIdent(table)} WHERE user_id = ?`)
  );
  const delUser = db.prepare("DELETE FROM users WHERE id = ?");

  const tx = db.transaction((ids) => {
    for (const id of ids) {
      for (const stmt of deleteStmts) stmt.run(id);
      delUser.run(id);
    }
  });
  tx(due.map((r) => r.id));

  console.log(
    `[purge] 已物理删除 ${due.length} 个到期注销账号及其全部数据（表：${tables.join(", ")}）`
  );
  return { purged: due.length };
}

// 清理过期的临时数据：游客额度（含 IP，隐私）与 JD 关键词缓存（TTL）。
export function runCleanup({ guestDays = 2, jdDays = 90 } = {}) {
  const guest = db
    .prepare("DELETE FROM guest_trials WHERE day < date('now', ?)")
    .run(`-${guestDays} days`);
  const jd = db
    .prepare("DELETE FROM jd_keywords WHERE created_at < datetime('now', ?)")
    .run(`-${jdDays} days`);
  return { guestTrials: guest.changes, jdKeywords: jd.changes };
}

// 启动时执行一次，之后按间隔轮询（默认每 6 小时）。
export function startPurgeJob(intervalMs = 6 * 60 * 60 * 1000) {
  const safeRun = () => {
    try {
      runPurge();
      runCleanup();
    } catch (error) {
      console.error("[purge] 执行失败:", error.message);
    }
  };

  safeRun();
  const timer = setInterval(safeRun, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}
