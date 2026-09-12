import crypto from "crypto";
import db from "./db.js";
import { extractJdKeywords } from "../llm/llm.js";

// 按 JD 文本哈希缓存 LLM 抽取的关键词，避免重复调用。
const getStmt = db.prepare("SELECT keywords FROM jd_keywords WHERE hash = ?");
const putStmt = db.prepare(
  "INSERT OR REPLACE INTO jd_keywords (hash, keywords, created_at) VALUES (?, ?, datetime('now'))"
);

export function jdHash(jdText) {
  return crypto.createHash("sha256").update(String(jdText || "").trim()).digest("hex").slice(0, 32);
}

// 返回关键词字符串数组；失败或无 JD 时返回 []（调用方回退内置词库）。
export async function getJdKeywords(jdText, externalSignal, override) {
  const text = String(jdText || "").trim();
  if (!text) return [];
  const hash = jdHash(text);

  const row = getStmt.get(hash);
  if (row) {
    try {
      const cached = JSON.parse(row.keywords);
      if (Array.isArray(cached) && cached.length) return cached;
    } catch {
      // 缓存损坏则重新抽取
    }
  }

  try {
    const keywords = await extractJdKeywords(text, externalSignal, override);
    if (keywords.length) putStmt.run(hash, JSON.stringify(keywords));
    return keywords;
  } catch (error) {
    console.warn("JD 关键词抽取失败，回退内置词库:", error.message);
    return [];
  }
}
