import { AsyncLocalStorage } from "async_hooks";
import db from "./db.js";
import { FREE_DAILY_LIMIT, QUOTA_WARN_RATIO } from "./plans.js";

// 用 AsyncLocalStorage 记录当前请求的「用户 + 功能」上下文，
// LLM 层在每次调用后自动上报 token 用量，无需改动各 LLM 函数签名。
const als = new AsyncLocalStorage();

export function withUsageContext(ctx, fn) {
  return als.run(ctx, fn);
}

const insertStmt = db.prepare(
  `INSERT INTO llm_usage (user_id, feature, model, prompt_tokens, completion_tokens, total_tokens)
   VALUES (?, ?, ?, ?, ?, ?)`
);

// LLM 层调用：把用量写入当前请求上下文（无上下文则忽略）
export function recordUsage(model, usage) {
  const ctx = als.getStore();
  if (!ctx || !usage) return;
  try {
    insertStmt.run(
      ctx.userId ?? null,
      ctx.feature || "unknown",
      String(model || "").slice(0, 60),
      Number(usage.prompt_tokens) || 0,
      Number(usage.completion_tokens) || 0,
      Number(usage.total_tokens) || 0
    );
  } catch (error) {
    console.warn("用量记录失败:", error.message);
  }
}

// 估算单价（¥ / 1M tokens）；可用 LLM_PRICE_JSON 覆盖
const DEFAULT_PRICING = {
  "deepseek-v4-flash": { in: 1, out: 2 },
  "deepseek-v4-pro": { in: 4, out: 12 },
  "deepseek-v4-flash-vision-exp": { in: 1, out: 2 },
  "glm-4.7-flash": { in: 0, out: 0 },
  "glm-4.5-flash": { in: 0, out: 0 },
  "glm-4.6": { in: 4, out: 16 },
  "glm-5.3": { in: 4, out: 16 },
  "glm-5.3-flash": { in: 1, out: 2 },
};

function pricing() {
  if (process.env.LLM_PRICE_JSON) {
    try {
      return { ...DEFAULT_PRICING, ...JSON.parse(process.env.LLM_PRICE_JSON) };
    } catch {
      // 解析失败则用默认
    }
  }
  return DEFAULT_PRICING;
}

function costOf(model, promptTokens, completionTokens) {
  const p = pricing()[model];
  if (!p) return 0;
  return (promptTokens * (p.in || 0) + completionTokens * (p.out || 0)) / 1_000_000;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// 昨日总成本（用于成本护栏告警；不做硬拦截，只告警）
export function yesterdayCost() {
  const rows = db
    .prepare(
      "SELECT model, prompt_tokens, completion_tokens FROM llm_usage WHERE date(created_at) = date('now', '-1 day')"
    )
    .all();
  let cost = 0;
  for (const r of rows) cost += costOf(r.model, r.prompt_tokens, r.completion_tokens);
  return { calls: rows.length, cost: round4(cost) };
}

// days：0=全部，1=今日，7=近 7 天（含今日）
export function usageSummary(days = 0) {
  const windowStart =
    days > 0 ? `datetime('now', 'start of day', '-${days - 1} days')` : null;
  const where = windowStart ? `WHERE created_at >= ${windowStart}` : "";

  const rows = db
    .prepare(
      `SELECT user_id, feature, model, prompt_tokens, completion_tokens, total_tokens, date(created_at) AS day
       FROM llm_usage ${where}`
    )
    .all();

  const totals = {
    calls: rows.length,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cost: 0,
  };
  const byFeature = new Map();
  const byModel = new Map();
  const byUser = new Map();
  const byDay = new Map();

  for (const r of rows) {
    const cost = costOf(r.model, r.prompt_tokens, r.completion_tokens);
    totals.prompt_tokens += r.prompt_tokens;
    totals.completion_tokens += r.completion_tokens;
    totals.total_tokens += r.total_tokens;
    totals.cost += cost;

    const bump = (map, key, extra) => {
      const cur =
        map.get(key) ||
        { calls: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0, ...extra };
      cur.calls += 1;
      cur.prompt_tokens += r.prompt_tokens;
      cur.completion_tokens += r.completion_tokens;
      cur.total_tokens += r.total_tokens;
      cur.cost += cost;
      map.set(key, cur);
    };

    bump(byFeature, r.feature, { feature: r.feature });
    bump(byModel, r.model, { model: r.model });
    bump(byUser, r.user_id ?? null, { user_id: r.user_id ?? null });
    bump(byDay, r.day, { day: r.day });
  }

  const emailStmt = db.prepare("SELECT email FROM users WHERE id = ?");
  const withCost = (x) => ({ ...x, cost: round4(x.cost) });
  const sortByTokens = (a, b) => b.total_tokens - a.total_tokens;

  return {
    rangeDays: days,
    totals: withCost(totals),
    byFeature: [...byFeature.values()].map(withCost).sort(sortByTokens),
    byModel: [...byModel.values()].map(withCost).sort(sortByTokens),
    byUser: [...byUser.values()]
      .map((u) => ({
        ...withCost(u),
        email: u.user_id != null ? emailStmt.get(u.user_id)?.email || "(已注销)" : "(游客)",
      }))
      .sort(sortByTokens)
      .slice(0, 100),
    byDay: [...byDay.values()].map(withCost).sort((a, b) => (a.day < b.day ? -1 : 1)),
    pricing: pricing(),
  };
}

// ===== 免费额度校准（数据驱动，而非拍脑袋）=====
// 问题：免费额度 100/天 时，80% 预警线 = 80 次，正常用户根本用不到 → 「额度焦虑」这个售卖杠杆对免费档不触发。
// 做法：看 per-user-per-day 用量分布，把 FREE_DAILY_LIMIT 定到 P90×1.5 左右，让预警在重用户身上真的出现。
// 数据源：quota_counters(kind='total')（旧库的 usage_log 已在启动时迁移进来）。
const DIST_MIN_SAMPLE = Number(process.env.USAGE_DIST_MIN_SAMPLE || 100);
// 目标：让约该比例的重用户×天 看到升级提示（用于反推一个"真的会触发"的额度）
const TARGET_WARN_PCT = Number(process.env.USAGE_TARGET_WARN_PCT || 10);

// 最近秩法（nearest-rank）：P(p) = 排序后第 ceil(p/100*n) 个
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const round10 = (n) => Math.round(n / 10) * 10;

// days：0=全部，N=近 N 天（含今日）
export function usageDistribution(days = 30) {
  const where = days > 0 ? `AND qc.day >= date('now', '-${days - 1} days')` : "";
  // 只统计「免费档」用户：PRO 日额度 500，混进来会把 P90 抬高 → 反推的免费额度偏大（校正方向正好相反）。
  // 注：按用户**当前**套餐过滤（历史套餐未记录）；用户升级 PRO 后，其历史免费用量也会被排除。
  const rows = db
    .prepare(
      `SELECT qc.user_id, qc.day, qc.count, COALESCE(u.plan, 'free') AS plan
       FROM quota_counters qc
       LEFT JOIN users u ON u.id = qc.user_id
       WHERE qc.kind = 'total' ${where}`
    )
    .all();
  const freeRows = rows.filter((r) => r.plan !== "pro");
  const proExcluded = rows.length - freeRows.length;
  const counts = freeRows.map((r) => Number(r.count) || 0).sort((a, b) => a - b);
  const n = counts.length;
  const p90 = percentile(counts, 90);

  const warnAt = Math.ceil(FREE_DAILY_LIMIT * QUOTA_WARN_RATIO);
  const hitWarn = counts.filter((c) => c >= warnAt).length;
  // 方案 A（用户提的启发式）：P90×1.5
  const suggestedLimit = round10(Math.ceil(p90 * 1.5));
  const suggestedWarnAt = Math.ceil(suggestedLimit * QUOTA_WARN_RATIO);
  const suggestedHitWarn = counts.filter((c) => c >= suggestedWarnAt).length;
  // 方案 B（目标触发率反推）：预警线落在 P(100-target) 上 → limit = warnAt / warnRatio
  //   比 P90×1.5 更稳：P90×1.5 的预警线在 1.2×P90，分布平的时候可能一个人都触发不到。
  const targetWarnAt = percentile(counts, 100 - TARGET_WARN_PCT);
  const targetLimit = round10(Math.ceil(targetWarnAt / QUOTA_WARN_RATIO));
  const targetLimitWarnAt = Math.ceil(targetLimit * QUOTA_WARN_RATIO);
  const targetLimitHit = counts.filter((c) => c >= targetLimitWarnAt).length;
  const pctOf = (x) => (n ? Math.round((x / n) * 1000) / 10 : 0);

  return {
    windowDays: days,
    userDays: n,
    users: new Set(freeRows.map((r) => r.user_id)).size,
    days: new Set(freeRows.map((r) => r.day)).size,
    proExcluded,
    minSample: DIST_MIN_SAMPLE,
    enoughSamples: n >= DIST_MIN_SAMPLE,
    percentiles: {
      p50: percentile(counts, 50),
      p75: percentile(counts, 75),
      p90,
      p95: percentile(counts, 95),
      p99: percentile(counts, 99),
      max: counts[n - 1] || 0,
    },
    freeLimit: FREE_DAILY_LIMIT,
    warnRatio: QUOTA_WARN_RATIO,
    warnAt,
    hitWarn,
    hitWarnPct: pctOf(hitWarn),
    suggestedLimit,
    suggestedWarnAt,
    suggestedHitWarnPct: pctOf(suggestedHitWarn),
    targetWarnPct: TARGET_WARN_PCT,
    targetLimit,
    targetLimitWarnAt,
    targetLimitHitPct: pctOf(targetLimitHit),
  };
}
