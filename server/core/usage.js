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
  return ((promptTokens * (p.in || 0)) + (completionTokens * (p.out || 0))) / 1_000_000;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

export function usageSummary() {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS calls,
              COALESCE(SUM(prompt_tokens),0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens),0) AS completion_tokens,
              COALESCE(SUM(total_tokens),0) AS total_tokens
       FROM llm_usage`
    )
    .get();

  const byFeature = db
    .prepare(
      `SELECT feature, COUNT(*) AS calls,
              COALESCE(SUM(prompt_tokens),0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens),0) AS completion_tokens,
              COALESCE(SUM(total_tokens),0) AS total_tokens
       FROM llm_usage GROUP BY feature ORDER BY total_tokens DESC`
    )
    .all();

  const byModel = db
    .prepare(
      `SELECT model, COUNT(*) AS calls,
              COALESCE(SUM(prompt_tokens),0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens),0) AS completion_tokens,
              COALESCE(SUM(total_tokens),0) AS total_tokens
       FROM llm_usage GROUP BY model ORDER BY total_tokens DESC`
    )
    .all();

  const byUser = db
    .prepare(
      `SELECT u.user_id, COALESCE(us.email, '(游客)') AS email,
              COUNT(*) AS calls,
              COALESCE(SUM(u.total_tokens),0) AS total_tokens,
              COALESCE(SUM(u.prompt_tokens),0) AS prompt_tokens,
              COALESCE(SUM(u.completion_tokens),0) AS completion_tokens
       FROM llm_usage u LEFT JOIN users us ON us.id = u.user_id
       GROUP BY u.user_id ORDER BY total_tokens DESC LIMIT 100`
    )
    .all();

  const withCost = (row) => ({ ...row, cost: round4(costOf(row.model || "", row.prompt_tokens, row.completion_tokens)) });
  const featureCost = byFeature.map((r) => ({
    ...r,
    cost: round4(
      db
        .prepare(
          `SELECT model, prompt_tokens, completion_tokens FROM llm_usage WHERE feature = ?`
        )
        .all(r.feature)
        .reduce((s, x) => s + costOf(x.model, x.prompt_tokens, x.completion_tokens), 0)
    ),
  }));

  return {
    totals: {
      ...totals,
      cost: round4(
        db
          .prepare("SELECT model, prompt_tokens, completion_tokens FROM llm_usage")
          .all()
          .reduce((s, x) => s + costOf(x.model, x.prompt_tokens, x.completion_tokens), 0)
      ),
    },
    byFeature: featureCost,
    byModel: byModel.map(withCost),
    byUser: byUser.map((r) => ({
      ...r,
      cost: round4(
        db
          .prepare(
            "SELECT model, prompt_tokens, completion_tokens FROM llm_usage WHERE user_id IS ?"
          )
          .all(r.user_id)
          .reduce((s, x) => s + costOf(x.model, x.prompt_tokens, x.completion_tokens), 0)
      ),
    })),
    pricing: pricing(),
  };
}
