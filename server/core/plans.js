// 免费 / PRO 的额度与模型分层（依据 docs/定价与额度.md）
// 结论：GLM-Flash 免费、DeepSeek-Flash 便宜 → 免费档用免费模型兜底、额度给足；
// 高级模型（V4-Pro / GLM-4.6 / GLM-5.3）作为 PRO 付费差异点。
import { listProviders } from "./models.js";

// 每日总额度
export const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT || 100);
export const PRO_DAILY_LIMIT = Number(process.env.PRO_DAILY_LIMIT || 500);
// 「额度即将用完」预警比例：用到该比例就在顶部提示升级（把售卖前置）
export const QUOTA_WARN_RATIO = Number(process.env.QUOTA_WARN_RATIO || 0.8);
// 高级模型每日额度（免费仅尝鲜）
export const FREE_PREMIUM_DAILY = Number(process.env.FREE_PREMIUM_DAILY || 5);
export const PRO_PREMIUM_DAILY = Number(process.env.PRO_PREMIUM_DAILY || 30);
// 图片/扫描简历 OCR 每日额度（PRO 0 表示不限）
export const FREE_OCR_DAILY = Number(process.env.FREE_OCR_DAILY || 3);
export const PRO_OCR_DAILY = Number(process.env.PRO_OCR_DAILY || 0);
// PRO 价格（元/月），仅用于展示
export const PRO_PRICE = Number(process.env.PRO_PRICE || 9.9);
// PRO 单次开通 / 续费的时长（月）；管理员批准或手动开通时写入 plan_expires_at
export const PRO_PERIOD_MONTHS = Number(process.env.PRO_PERIOD_MONTHS || 1);

// 支付方式（支付网关接入前的最简闭环）：
//   PRO_PAY_QR  —— 收款码图片地址（站内路径如 /pay-qr.png，或 data:image/... ）
//   PRO_PAY_URL —— 外部支付链接（有赞 / 爱发电等），点按新窗口打开
//   PRO_PAY_NOTE—— 补充说明（如"转账后请填写邮箱"）
// 均未配置时，/pro 页只展示"提交申请、管理员开通"的引导。
export const PRO_PAY_QR = process.env.PRO_PAY_QR || "";
export const PRO_PAY_URL = process.env.PRO_PAY_URL || "";
export const PRO_PAY_NOTE = process.env.PRO_PAY_NOTE || "";

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

// 到期时间字段（兼容 DB 行 snake_case 与 req.user camelCase）
function expiryOf(user) {
  return user?.plan_expires_at ?? user?.planExpiresAt ?? null;
}

// 解析 SQLite datetime（UTC，形如 "2026-09-12 10:00:00"）为毫秒时间戳；无法解析返回 null
function parseUtc(dt) {
  if (!dt) return null;
  const s = String(dt).trim().replace(" ", "T");
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isFinite(t) ? t : null;
}

// 是否已过期；无 plan_expires_at（NULL）= 永久有效，不算过期
export function isPlanExpired(user) {
  if (!user || user.plan !== "pro") return false;
  const exp = expiryOf(user);
  if (!exp) return false;
  const t = parseUtc(exp);
  return t !== null && t <= Date.now();
}

// PRO 到期剩余天数（向上取整）；永久 / 非 PRO 返回 null
export function planDaysLeft(user) {
  if (!user || user.plan !== "pro") return null;
  const exp = expiryOf(user);
  const t = parseUtc(exp);
  if (t === null) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

// SQLite datetime 修饰符，如 '+1 month'（由数字拼出，无注入风险）
export function proPeriodModifier() {
  return `+${PRO_PERIOD_MONTHS} month`;
}

// 归一化套餐：admin（不限）> pro（未过期）> free；PRO 过期自动回落 free
export function normalizePlan(user) {
  if (!user) return "free";
  if (user.role === "admin") return "admin";
  if (user.plan !== "pro") return "free";
  return isPlanExpired(user) ? "free" : "pro";
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
