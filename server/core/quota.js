import db from "./db.js";

export const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 30);

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function getUsage(userId) {
  const row = db
    .prepare("SELECT count FROM usage_log WHERE user_id = ? AND day = ?")
    .get(userId, today());
  return row ? row.count : 0;
}

// 检查并消耗一次额度；返回 { allowed, used, limit }
export function consumeQuota(userId, limit = DAILY_LIMIT) {
  const day = today();
  const used = getUsage(userId);
  if (used >= limit) return { allowed: false, used, limit };

  db.prepare(
    `INSERT INTO usage_log (user_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`
  ).run(userId, day);

  return { allowed: true, used: used + 1, limit };
}
