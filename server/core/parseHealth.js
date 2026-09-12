import db from "./db.js";

// ADR-0007 的量化触发器：近 N 天「报告解析降级率」超阈值且样本足够 → 启用尾部机器可读块。
// 这些值即 ADR 里承诺的触发条件；改动需同步 docs/adr/0007-report-format-stays-text.md。
export const PARSE_WINDOW_DAYS = Number(process.env.PARSE_WINDOW_DAYS || 7);
export const PARSE_DEGRADE_THRESHOLD = Number(process.env.PARSE_DEGRADE_THRESHOLD || 0.05);
export const PARSE_MIN_SAMPLES = Number(process.env.PARSE_MIN_SAMPLES || 200);

const countStmt = db.prepare(
  "SELECT COUNT(*) AS c FROM events WHERE name = ? AND created_at >= datetime('now', ?)"
);

function countSince(name, days) {
  return countStmt.get(name, `-${Math.max(0, days - 1)} days`)?.c || 0;
}

// 解析健康度 + 是否达到「启用机器可读块」的触发条件
export function parseHealth(days = PARSE_WINDOW_DAYS) {
  const windowDays = Number(days) > 0 ? Number(days) : PARSE_WINDOW_DAYS;
  const parses = countSince("report_parse", windowDays);
  const fallbacks = countSince("report_parse_fallback", windowDays);
  const rate = parses ? fallbacks / parses : 0;
  const enoughSamples = parses >= PARSE_MIN_SAMPLES;
  return {
    windowDays,
    parses,
    fallbacks,
    rate: Math.round(rate * 10000) / 10000,
    threshold: PARSE_DEGRADE_THRESHOLD,
    minSamples: PARSE_MIN_SAMPLES,
    enoughSamples,
    shouldEnableMachineBlock: enoughSamples && rate > PARSE_DEGRADE_THRESHOLD,
  };
}
