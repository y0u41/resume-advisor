// 免费 / PRO 的额度与模型分层（依据 docs/定价与额度.md）
// 结论：GLM-Flash 免费、DeepSeek-Flash 便宜 → 免费档用免费模型兜底、额度给足；
// 高级模型（V4-Pro / GLM-4.6 / GLM-5.3）作为 PRO 付费差异点。
import { listProviders } from "./models.js";

// 每日总额度
export const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT || 100);
export const PRO_DAILY_LIMIT = Number(process.env.PRO_DAILY_LIMIT || 500);
// 高级模型每日额度（免费仅尝鲜）
export const FREE_PREMIUM_DAILY = Number(process.env.FREE_PREMIUM_DAILY || 5);
export const PRO_PREMIUM_DAILY = Number(process.env.PRO_PREMIUM_DAILY || 30);
// 图片/扫描简历 OCR 每日额度（PRO 0 表示不限）
export const FREE_OCR_DAILY = Number(process.env.FREE_OCR_DAILY || 3);
export const PRO_OCR_DAILY = Number(process.env.PRO_OCR_DAILY || 0);
// PRO 价格（元/月），仅用于展示
export const PRO_PRICE = Number(process.env.PRO_PRICE || 9.9);

// 高成本模型：计入 premium 额度，而非普通额度
export const PREMIUM_MODELS = new Set(
  (process.env.PREMIUM_MODELS || "deepseek-v4-pro,glm-4.6,glm-5.3")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

// 默认模型：免费档走免费的 GLM-Flash（成本≈0），PRO 走 DeepSeek-Flash
const FREE_DEFAULT = {
  provider: process.env.FREE_DEFAULT_PROVIDER || "bigmodel",
  model: process.env.FREE_DEFAULT_MODEL || "glm-4.7-flash",
};
const PRO_DEFAULT = {
  provider: process.env.PRO_DEFAULT_PROVIDER || "deepseek",
  model: process.env.PRO_DEFAULT_MODEL || "deepseek-v4-flash",
};

export function isPremiumModel(model) {
  return PREMIUM_MODELS.has(String(model || ""));
}

// 归一化套餐：admin（不限）> pro > free
export function normalizePlan(user) {
  if (!user) return "free";
  if (user.role === "admin") return "admin";
  return user.plan === "pro" ? "pro" : "free";
}

export function isUnlimited(plan) {
  return plan === "admin";
}

export function dailyLimitFor(plan) {
  if (plan === "admin") return Infinity;
  return plan === "pro" ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
}

export function premiumDailyFor(plan) {
  if (plan === "admin") return Infinity;
  return plan === "pro" ? PRO_PREMIUM_DAILY : FREE_PREMIUM_DAILY;
}

// 返回每日 OCR 上限；0 表示不限
export function ocrDailyFor(plan) {
  if (plan === "admin") return Infinity;
  return plan === "pro" ? PRO_OCR_DAILY : FREE_OCR_DAILY;
}

// 按 plan 选默认模型；该 provider/model 未配置时返回 undefined（调用方回退 env 默认）
export function defaultModelFor(plan) {
  const pick = plan === "pro" ? PRO_DEFAULT : FREE_DEFAULT;
  const group = listProviders().find((p) => p.provider === pick.provider);
  if (group && group.models.some((m) => m.id === pick.model)) return pick;
  return undefined;
}
