import crypto from "crypto";
import db from "./db.js";
import { extractJdKeywords } from "../llm/llm.js";

// 按 JD 文本哈希缓存 LLM 抽取的关键词，避免重复调用。
// 同时记录「岗位名 + 命中次数」，沉淀为可公开的岗位关键词库（见 core/keywordLibrary.js）。
const getStmt = db.prepare("SELECT keywords FROM jd_keywords WHERE hash = ?");
const hitStmt = db.prepare(
  "UPDATE jd_keywords SET hits = hits + 1, updated_at = datetime('now') WHERE hash = ?"
);
const putStmt = db.prepare(
  `INSERT INTO jd_keywords (hash, keywords, job_title, hits, created_at, updated_at)
   VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
   ON CONFLICT(hash) DO UPDATE SET
     keywords = excluded.keywords,
     job_title = CASE WHEN excluded.job_title <> '' THEN excluded.job_title ELSE jd_keywords.job_title END,
     hits = jd_keywords.hits + 1,
     updated_at = datetime('now')`
);

export function jdHash(jdText) {
  return crypto.createHash("sha256").update(String(jdText || "").trim()).digest("hex").slice(0, 32);
}

// 返回关键词字符串数组；失败或无 JD 时返回 []（调用方回退内置词库）。
// jobTitle 用于把这次 JD 归入岗位关键词库（可空）。
export async function getJdKeywords(jdText, externalSignal, override, jobTitle = "") {
  const text = String(jdText || "").trim();
  if (!text) return [];
  const hash = jdHash(text);

  const row = getStmt.get(hash);
  if (row) {
    try {
      const cached = JSON.parse(row.keywords);
      if (Array.isArray(cached) && cached.length) {
        try {
          hitStmt.run(hash);
        } catch {
          // 计数失败不影响返回
        }
        return cached;
      }
    } catch {
      // 缓存损坏则重新抽取
    }
  }

  try {
    const keywords = await extractJdKeywords(text, externalSignal, override);
    if (keywords.length) {
      try {
        putStmt.run(hash, JSON.stringify(keywords), String(jobTitle || "").trim().slice(0, 120));
      } catch {
        // 写库失败不影响本次返回
      }
    }
    return keywords;
  } catch (error) {
    console.warn("JD 关键词抽取失败，回退内置词库:", error.message);
    return [];
  }
}
