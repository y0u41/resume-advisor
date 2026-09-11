import { countOccurrences, extractKeywords } from "./extract.js";
import { normalizeText } from "./normalize.js";
import { round2, round4 } from "./round.js";

// 计算简历文本与岗位 JD 的匹配度。
// matchRate = Σ(weight · matched) / Σ(weight)，结果可逐项解释。
export function matchTextToJD(resumeText, jdText, options = {}) {
  const keywords = options.keywords ? [...options.keywords] : extractKeywords(jdText, options);
  const haystack = normalizeText(resumeText);

  const details = keywords.map((kw) => {
    const evidence = kw.terms.filter((term) => countOccurrences(haystack, term) > 0);
    return {
      canonical: kw.canonical,
      category: kw.category,
      weight: kw.weight,
      matched: evidence.length > 0,
      evidence,
    };
  });

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const d of details) {
    totalWeight += d.weight;
    if (d.matched) matchedWeight += d.weight;
  }

  const matchRate = totalWeight === 0 ? 0 : round4(matchedWeight / totalWeight);
  const missing = details.filter((d) => !d.matched).sort((a, b) => b.weight - a.weight);

  return {
    matchRate,
    matchedWeight: round2(matchedWeight),
    totalWeight: round2(totalWeight),
    keywords: details,
    matched: details.filter((d) => d.matched),
    missing,
  };
}
