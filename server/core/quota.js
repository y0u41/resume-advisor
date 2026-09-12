import db from "./db.js";
import {
  normalizePlan,
  dailyLimitFor,
  premiumDailyFor,
  ocrDailyFor,
  isUnlimited,
  planDaysLeft,
  PRO_PRICE,
  PRO_DAILY_LIMIT,
  QUOTA_WARN_RATIO,
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

// 只读快照：当前套餐的用量/额度（不消耗），用于前端「额度即将用完」预警
export function getQuota(user) {
  const plan = normalizePlan(user);
  const unlimited = isUnlimited(plan);
  const limit = dailyLimitFor(plan);
  const premiumLimit = premiumDailyFor(plan);
  return {
    plan,
    unlimited,
    used: unlimited ? 0 : getUsage(user.id),
    limit: Number.isFinite(limit) ? limit : -1,
    premiumUsed: unlimited ? 0 : getPremiumUsage(user.id),
    premiumLimit: Number.isFinite(premiumLimit) ? premiumLimit : -1,
    planExpiresAt: plan === "pro" && user.role !== "admin" ? user.planExpiresAt || null : null,
    daysLeft: plan === "pro" ? planDaysLeft(user) : null,
    warnRatio: QUOTA_WARN_RATIO,
    warnAt: Number.isFinite(limit) ? Math.ceil(limit * QUOTA_WARN_RATIO) : -1,
    proDaily: PRO_DAILY_LIMIT,
    price: PRO_PRICE,
  };
}

// 额度用尽时的用户提示（指向可兑现的升级入口）
export function quotaMessage(quota) {
  const upsell = `可在「升级 PRO」页申请开通（¥${PRO_PRICE}/月）`;
  if (quota.reason === "premium") {
    return `今日高级模型额度已用完（${quota.premiumUsed}/${quota.premiumLimit}），可改用标准模型，或${upsell}`;
  }
  if (quota.reason === "ocr") {
    return `今日图片/扫描简历识别额度已用完（${quota.ocrUsed}/${quota.ocrLimit}），可粘贴文字，或${upsell}`;
  }
  return `今日评估次数已用完（${quota.used}/${quota.limit}），可改用标准模型，或${upsell}`;
}
