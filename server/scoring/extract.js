import { LEXICON, STOPWORDS } from "./lexicon.js";
import { normalizeText } from "./normalize.js";
import { round2 } from "./round.js";

const LATIN_OR_DIGIT = /[a-z0-9]/;

// 统计 needle 在已归一化的 haystack 中出现次数。
// 拉丁/数字做词边界校验（避免 "java" 命中 "javascript"）；中文直接子串匹配。
export function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    const before = idx > 0 ? haystack[idx - 1] : "";
    const afterIdx = idx + needle.length;
    const after = afterIdx < haystack.length ? haystack[afterIdx] : "";
    const leftOk = !(LATIN_OR_DIGIT.test(needle[0]) && LATIN_OR_DIGIT.test(before));
    const rightOk = !(LATIN_OR_DIGIT.test(needle[needle.length - 1]) && LATIN_OR_DIGIT.test(after));
    if (leftOk && rightOk) count += 1;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return count;
}

function dedupe(values) {
  return [...new Set(values)];
}

// 从岗位 JD 中提取关键词。规则驱动、结果确定：先做词库匹配，再用英文专有名词兜底。
export function extractKeywords(jdText, options = {}) {
  const lexicon = options.lexicon ?? LEXICON;
  const max = options.max ?? 30;
  const text = normalizeText(jdText);
  if (!text) return [];

  const results = new Map();

  for (const entry of lexicon) {
    const terms = dedupe([entry.canonical, ...entry.aliases].map(normalizeText).filter(Boolean));
    let count = 0;
    let firstIdx = Number.POSITIVE_INFINITY;

    for (const term of terms) {
      const idx = text.indexOf(term);
      if (idx !== -1) firstIdx = Math.min(firstIdx, idx);
      count += countOccurrences(text, term);
    }
    if (count === 0) continue;

    const positionBoost = firstIdx <= text.length * 0.3 ? 0.5 : 0;
    const frequencyBoost = Math.min(count - 1, 2) * 0.25;

    results.set(entry.canonical, {
      canonical: entry.canonical,
      category: entry.category,
      weight: round2(entry.weight + positionBoost + frequencyBoost),
      count,
      terms,
    });
  }

  // 兜底：词库未覆盖的英文专有名词（如具体技术名、工具名）
  const known = new Set();
  for (const kw of results.values()) for (const term of kw.terms) known.add(term);

  for (const token of text.match(/[a-z][a-z0-9+#.-]{1,}/g) ?? []) {
    if (STOPWORDS.has(token) || known.has(token) || results.has(token)) continue;
    results.set(token, {
      canonical: token,
      category: "other",
      weight: 1,
      count: countOccurrences(text, token),
      terms: [token],
    });
  }

  return [...results.values()]
    .sort((a, b) => b.weight - a.weight || b.count - a.count || a.canonical.localeCompare(b.canonical))
    .slice(0, max);
}
