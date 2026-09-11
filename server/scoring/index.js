// 确定性「客观分」引擎（词典驱动、可解释、可复现）。
// 移植自 resume-workshop（MIT License），并适配为面向纯文本简历。
export { evaluateResume } from "./evaluate.js";
export { matchTextToJD } from "./match.js";
export { extractKeywords, countOccurrences } from "./extract.js";
export { normalizeText } from "./normalize.js";
export { round2, round4 } from "./round.js";
