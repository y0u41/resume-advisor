import db from "./db.js";
import {
  normalizePlan,
  dailyLimitFor,
  premiumDailyFor,
  ocrDailyFor,
  isUnlimited,
} from "./plans.js";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getCount(userId, kind) {
  const row = db
    .prepare("SELECT count FROM quota_counters WHERE user_id = ? AND day = ? AND kind = ?")
    .get(userId, today(), kind);
  return row ? row.count : 0;
}

function incr(userId, kind) {
  db.prepare(
    `INSERT INTO quota_counters (user_id, day, kind, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, day, kind) DO UPDATE SET count = count + 1`
  ).run(userId, today(), kind);
}

export function getUsage(userId) {
  return getCount(userId, "total");
}

export function getPremiumUsage(userId) {
  return getCount(userId, "premium");
}

export function getOcrUsage(userId) {
  return getCount(userId, "ocr");
}

// 检查并消耗一次额度；管理员（admin）不受限制、不计数。
// isPremium：本次是否使用高级模型；isOcr：本次是否为图片/扫描简历 OCR。
// 返回 { allowed, reason?, used, limit, premiumUsed, premiumLimit, ocrUsed, ocrLimit, plan }
export function consumeQuota(user, { isPremium = false, isOcr = false } = {}) {
  const plan = normalizePlan(user);
  const limit = dailyLimitFor(plan);
  const premiumLimit = premiumDailyFor(plan);
  const ocrLimit = ocrDailyFor(plan);
  const used = getUsage(user.id);
  const premiumUsed = getPremiumUsage(user.id);
  const ocrUsed = getOcrUsage(user.id);

  const base = { used, limit, premiumUsed, premiumLimit, ocrUsed, ocrLimit, plan };

  if (isUnlimited(plan)) {
    return { allowed: true, ...base };
  }
  if (used >= limit) {
    return { allowed: false, reason: "daily", ...base };
  }
  if (isPremium && premiumUsed >= premiumLimit) {
    return { allowed: false, reason: "premium", ...base };
  }
  if (isOcr && ocrLimit > 0 && ocrUsed >= ocrLimit) {
    return { allowed: false, reason: "ocr", ...base };
  }

  incr(user.id, "total");
  if (isPremium) incr(user.id, "premium");
  if (isOcr) incr(user.id, "ocr");

  return {
    allowed: true,
    ...base,
    used: used + 1,
    premiumUsed: premiumUsed + (isPremium ? 1 : 0),
    ocrUsed: ocrUsed + (isOcr ? 1 : 0),
  };
}

// 额度用尽时的用户提示
export function quotaMessage(quota) {
  if (quota.reason === "premium") {
    return `今日高级模型额度已用完（${quota.premiumUsed}/${quota.premiumLimit}），可改用标准模型或升级 PRO`;
  }
  if (quota.reason === "ocr") {
    return `今日图片/扫描简历识别额度已用完（${quota.ocrUsed}/${quota.ocrLimit}），可粘贴文字或升级 PRO`;
  }
  return `今日评估次数已用完（${quota.used}/${quota.limit}），请明天再试或升级 PRO`;
}
