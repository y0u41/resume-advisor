import { AsyncLocalStorage } from "async_hooks";
import db from "./db.js";

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
