import crypto from "crypto";
import db from "./db.js";

// 游客转化实验：按 IP **稳定分桶**（同一个人始终在同一组），配置来自环境变量。
//   GUEST_AB_LIMITS  —— 试用次数两组，如 "3,5"
//   GUEST_AB_PREVIEW —— 预览字数两组，如 "800,1500"
// 未配置则退化为单组（用 GUEST_LIMIT / GUEST_PREVIEW_CHARS），即实验关闭。
const DEFAULT_LIMIT = Number(process.env.GUEST_LIMIT || 3);
const DEFAULT_PREVIEW = Number(process.env.GUEST_PREVIEW_CHARS || 800);

function parsePair(s) {
  if (!s) return null;
  const arr = String(s)
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return arr.length === 2 ? arr : null;
}

export const GUEST_AB_LIMITS = parsePair(process.env.GUEST_AB_LIMITS);
export const GUEST_AB_PREVIEW = parsePair(process.env.GUEST_AB_PREVIEW);
// 单组最小样本量：低于此值不下结论（两因素独立分桶，样本小时交互效应会互相污染）
export const GUEST_AB_MIN_SAMPLE = Number(process.env.GUEST_AB_MIN_SAMPLE || 100);

function bucket(ip, salt) {
  const h = crypto.createHash("sha256").update(`${salt}:${ip || ""}`).digest();
  return h[0] % 2;
}

// 返回该 IP 被分到的 { limit, preview }（两次独立分桶，可分别度量两个因素）
export function guestVariant(ip) {
  const limits = GUEST_AB_LIMITS || [DEFAULT_LIMIT, DEFAULT_LIMIT];
  const previews = GUEST_AB_PREVIEW || [DEFAULT_PREVIEW, DEFAULT_PREVIEW];
  return {
    limit: limits[bucket(ip, "limit")],
    preview: previews[bucket(ip, "preview")],
  };
}

// 从 events 聚合实验：按试用次数分组、按预览长度分组，各自算 试用→注册 转化率
export function guestExperimentStats(days = 0) {
  const where =
    days > 0 ? `AND created_at >= datetime('now', 'start of day', '-${days - 1} days')` : "";
  const rows = db
    .prepare(
      `SELECT name, meta FROM events WHERE name IN ('guest_trial', 'register_from_guest') ${where}`
    )
    .all();

  const trials = { limit: new Map(), preview: new Map() };
  const regs = { limit: new Map(), preview: new Map() };
  for (const r of rows) {
    let m = {};
    try {
      m = JSON.parse(r.meta || "{}");
    } catch {
      m = {};
    }
    const t = r.name === "guest_trial" ? trials : regs;
    if (m.limit != null) t.limit.set(m.limit, (t.limit.get(m.limit) || 0) + 1);
    if (m.preview != null) t.preview.set(m.preview, (t.preview.get(m.preview) || 0) + 1);
  }

  const build = (trialMap, regMap) => {
    const values = [...new Set([...trialMap.keys(), ...regMap.keys()])].sort((a, b) => a - b);
    return values.map((v) => {
      const t = trialMap.get(v) || 0;
      const g = regMap.get(v) || 0;
      return {
        value: v,
        trials: t,
        registers: g,
        rate: t ? Math.round((g / t) * 1000) / 10 : 0,
        enough: t >= GUEST_AB_MIN_SAMPLE,
      };
    });
  };

  const byLimit = build(trials.limit, regs.limit);
  const byPreview = build(trials.preview, regs.preview);
  const all = [...byLimit, ...byPreview];

  return {
    days,
    active: Boolean(GUEST_AB_LIMITS || GUEST_AB_PREVIEW),
    minSample: GUEST_AB_MIN_SAMPLE,
    // 所有已出现的组都达到最小样本量，才认为结论可靠
    enoughSamples: all.length > 0 && all.every((g) => g.enough),
    config: { limits: GUEST_AB_LIMITS, preview: GUEST_AB_PREVIEW },
    byLimit,
    byPreview,
  };
}
