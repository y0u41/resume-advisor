import db from "./db.js";

// 最小埋点集：注册、首次评估、报告读完、追问、下载、7 日回访
// 另含漏斗关键事件：guest_trial（游客试用）、register_from_guest（试用后注册）
export const EVENT_NAMES = [
  "register",
  "first_evaluate",
  "report_read",
  "followup",
  "download",
  "return_7d",
  "guest_trial",
  "register_from_guest",
];

const insertStmt = db.prepare("INSERT INTO events (user_id, name, meta) VALUES (?, ?, ?)");

export function logEvent(userId, name, meta = null) {
  try {
    insertStmt.run(
      userId ?? null,
      String(name).slice(0, 40),
      meta ? JSON.stringify(meta).slice(0, 1000) : ""
    );
  } catch (error) {
    console.warn("事件记录失败:", error.message);
  }
}

// 当天是否已记录过该事件（用于 7 日回访等去重）
export function hasEventToday(userId, name) {
  return !!db
    .prepare(
      "SELECT 1 FROM events WHERE user_id = ? AND name = ? AND date(created_at) = date('now') LIMIT 1"
    )
    .get(userId, name);
}

export function eventCounts() {
  return db
    .prepare("SELECT name, COUNT(*) AS count FROM events GROUP BY name ORDER BY count DESC")
    .all();
}

export function recentEvents(limit = 50) {
  return db
    .prepare("SELECT id, user_id, name, meta, created_at FROM events ORDER BY id DESC LIMIT ?")
    .all(limit);
}
