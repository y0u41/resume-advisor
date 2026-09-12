import { matchTextToJD } from "./match.js";
import { countOccurrences } from "./extract.js";
import { normalizeText } from "./normalize.js";
import { round2 } from "./round.js";
import { checkAts } from "./ats.js";

// 把「LLM 抽取的关键词字符串」转成与词库同构的关键词对象。
// 权重仍按「基础 + 位置加成 + 词频加成」计算，匹配过程仍是确定性、可解释的，
// 只是关键词来源从内置词库换成了 LLM —— 从而覆盖任意行业。
function keywordsFromList(list, jdText) {
  const text = normalizeText(jdText);
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const canonical = String(raw || "").trim();
    if (!canonical) continue;
    const term = normalizeText(canonical);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    const idx = text.indexOf(term);
    const count = countOccurrences(text, term);
    const positionBoost = idx >= 0 && idx <= text.length * 0.3 ? 0.5 : 0;
    const frequencyBoost = Math.min(Math.max(count - 1, 0), 2) * 0.25;
    out.push({
      canonical,
      category: "llm",
      weight: round2(3 + positionBoost + frequencyBoost),
      count,
      terms: [term],
    });
  }
  return out;
}

// 基准权重；无 JD 时 keywordCoverage 会被剔除并对其余维度重新归一化。
const BASE_WEIGHTS = {
  completeness: 0.3,
  keywordCoverage: 0.3,
  format: 0.2,
  quantification: 0.2,
};

const LABELS = {
  completeness: "完整性",
  keywordCoverage: "关键词覆盖",
  format: "格式规范",
  quantification: "量化成果",
};

const QUANT_UNITS =
  "%|％|倍|万|千|k|K|w|W|ms|s|min|h|个|项|次|人|人次|名|位|小时|分钟|秒|天|周|月|元|用户|页面|模块|接口|条";
const QUANT_RE = new RegExp(`\\d+(?:\\.\\d+)?\\s*[+＋]?\\s*(?:${QUANT_UNITS})`);

function isQuantified(line) {
  // 排除 19xx/20xx 年份后再判断是否含量化表达；允许 1000+ / 3.5 等形式
  const cleaned = line.replace(/(19|20)\d{2}\s*年/g, "");
  return QUANT_RE.test(cleaned) || /\d+\.\d+/.test(cleaned);
}

function nonEmptyLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const RE = {
  contact: /(1[3-9]\d{9})|([\w.+-]+@[\w-]+\.[\w.-]+)/,
  city: /(城市|所在地|现居|居住地|坐标|籍贯|期望城市)/,
  summary: /(自我评价|个人简介|个人优势|自我介绍|简介)/,
  education: /(教育|学历|学校|大学|学院|本科|硕士|博士|研究生|gpa)/i,
  experience: /(实习|工作经历|工作经验|任职|就职|公司|岗位职责|工作内容|项目经历)/,
  projects: /(项目|作品|开发经验|实践经历)/,
  skills: /(技能|技术栈|掌握|熟悉|精通|擅长)/,
};

// 完整性：8 项加权检查（姓名2/联系方式2/城市1/简介1/教育2/经历3/项目2/技能2）
export function scoreCompleteness(resumeText) {
  const text = String(resumeText || "");
  const lines = nonEmptyLines(text);
  const first = lines[0] || "";
  const hasName =
    first.length > 0 && first.length <= 12 && !RE.contact.test(first) && !/https?:/i.test(first);

  const checks = [
    { ok: hasName, w: 2, label: "姓名" },
    { ok: RE.contact.test(text), w: 2, label: "联系方式" },
    { ok: RE.city.test(text), w: 1, label: "城市" },
    { ok: RE.summary.test(text), w: 1, label: "个人简介" },
    { ok: RE.education.test(text), w: 2, label: "教育经历" },
    { ok: RE.experience.test(text), w: 3, label: "实习/工作经历" },
    { ok: RE.projects.test(text), w: 2, label: "项目经历" },
    { ok: RE.skills.test(text), w: 2, label: "技能" },
  ];
  const total = checks.reduce((s, c) => s + c.w, 0);
  const got = checks.reduce((s, c) => s + (c.ok ? c.w : 0), 0);
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  return {
    name: "completeness",
    label: LABELS.completeness,
    score: round2((got / total) * 100),
    weight: BASE_WEIGHTS.completeness,
    weighted: 0,
    reason: missing.length === 0 ? "各模块齐全" : `缺少：${missing.join("、")}`,
  };
}

// 格式规范：篇幅 0.3 + 空条目 0.25 + 日期 0.25 + 联系方式 0.2
export function scoreFormat(resumeText) {
  const text = String(resumeText || "");
  const compact = text.replace(/\s/g, "");
  const len = compact.length;
  const lengthScore = len < 100 ? 20 : len < 200 ? 60 : len <= 4000 ? 100 : 80;

  const lines = nonEmptyLines(text);
  const emptyish = lines.filter((l) => /^[-*•·\s]+$/.test(l)).length;
  const bulletScore = lines.length === 0 ? 50 : Math.max(0, (1 - emptyish / lines.length) * 100);

  const years = text.match(/\b(19|20)\d{2}\b/g) || [];
  const dateScore = years.length >= 2 ? 100 : 50;

  const contactScore = RE.contact.test(text) ? 100 : 40;

  const score = round2(
    lengthScore * 0.3 + bulletScore * 0.25 + dateScore * 0.25 + contactScore * 0.2
  );

  const issues = [];
  if (lengthScore < 100) issues.push(len < 200 ? "篇幅过短" : "篇幅过长");
  if (dateScore < 100) issues.push("日期信息不足");
  if (contactScore < 100) issues.push("联系方式不完整");

  return {
    name: "format",
    label: LABELS.format,
    score,
    weight: BASE_WEIGHTS.format,
    weighted: 0,
    reason: issues.length === 0 ? "格式规范" : issues.join("；"),
  };
}

// 量化成果：含量化表达的内容行占比 ÷ 50%，封顶 100
export function scoreQuantification(resumeText) {
  const lines = nonEmptyLines(resumeText).filter((l) => l.length >= 8);
  if (lines.length === 0) {
    return {
      name: "quantification",
      label: LABELS.quantification,
      score: 0,
      weight: BASE_WEIGHTS.quantification,
      weighted: 0,
      reason: "没有可量化的经历条目",
    };
  }
  const quantified = lines.filter(isQuantified).length;
  const ratio = quantified / lines.length;
  return {
    name: "quantification",
    label: LABELS.quantification,
    score: round2(Math.min(ratio / 0.5, 1) * 100),
    weight: BASE_WEIGHTS.quantification,
    weighted: 0,
    reason: `${quantified}/${lines.length} 条内容含量化结果`,
  };
}

// 依据各维度得分与缺失关键词，生成「具体、可执行」的修改建议。
function buildSuggestions(dimensions, missing) {
  const out = [];
  const dim = (n) => dimensions.find((d) => d.name === n);
  const missingTop = missing.slice(0, 8).map((m) => m.canonical);

  const completeness = dim("completeness");
  if (completeness && completeness.score < 80) {
    out.push({
      dimension: "completeness",
      level: "high",
      message: `简历结构不完整（${completeness.reason}）。请补齐上述模块后再评估。`,
    });
  }

  const keywordCoverage = dim("keywordCoverage");
  if (keywordCoverage && keywordCoverage.score < 60 && missingTop.length > 0) {
    out.push({
      dimension: "keywords",
      level: "high",
      message: `目标岗位的关键词在简历中缺失，建议补充相关经历或技能：${missingTop.join("、")}。`,
      relatedTerms: missingTop,
    });
  } else if (keywordCoverage && keywordCoverage.score < 80 && missingTop.length > 0) {
    out.push({
      dimension: "keywords",
      level: "medium",
      message: `仍有部分岗位关键词未覆盖：${missingTop.slice(0, 5).join("、")}。`,
      relatedTerms: missingTop.slice(0, 5),
    });
  }

  const quantification = dim("quantification");
  if (quantification && quantification.score < 60) {
    out.push({
      dimension: "quantification",
      level: "medium",
      message:
        "经历描述缺少量化结果。建议用「数字 + 结果」表达，例如「优化接口使响应时间下降 40%」「负责 3 个模块」等。",
    });
  }

  const format = dim("format");
  if (format && format.score < 80) {
    out.push({
      dimension: "format",
      level: "medium",
      message: `格式存在问题（${format.reason}）。请统一日期格式、清理空条目、控制篇幅在 1–2 页。`,
    });
  }

  if (out.length === 0) {
    out.push({
      dimension: "completeness",
      level: "low",
      message: "简历整体质量良好，可进一步针对目标岗位微调措辞与关键词。",
    });
  }

  return out;
}

// 简历评分。四维加权；无 JD 时剔除关键词维度并重新归一化权重。
// 本引擎面向纯文本简历，是确定性的「客观分」，与 LLM 生成的报告并存、互相印证。
export function evaluateResume(resumeText, options = {}) {
  const hasJd = Boolean(options.jdText && options.jdText.trim());
  // 优先使用外部（LLM 抽取）关键词；无则回退内置词典
  const externalKeywords =
    hasJd && Array.isArray(options.jdKeywords) && options.jdKeywords.length
      ? keywordsFromList(options.jdKeywords, options.jdText)
      : null;
  const match = hasJd
    ? matchTextToJD(
        resumeText,
        options.jdText,
        externalKeywords ? { keywords: externalKeywords } : {}
      )
    : undefined;

  const raw = [scoreCompleteness(resumeText), scoreFormat(resumeText), scoreQuantification(resumeText)];

  if (hasJd && match) {
    raw.push({
      name: "keywordCoverage",
      label: LABELS.keywordCoverage,
      score: round2(match.matchRate * 100),
      weight: BASE_WEIGHTS.keywordCoverage,
      weighted: 0,
      reason: `匹配 ${round2(match.matchedWeight)}/${round2(match.totalWeight)} 权重`,
    });
  }

  const weightSum = raw.reduce((s, d) => s + BASE_WEIGHTS[d.name], 0);
  const dimensions = raw.map((d) => {
    const weight = BASE_WEIGHTS[d.name] / weightSum;
    return { ...d, weight, weighted: round2(d.score * weight) };
  });

  const score = round2(dimensions.reduce((s, d) => s + d.weighted, 0));
  const suggestions = buildSuggestions(dimensions, match?.missing ?? []);

  return {
    score,
    dimensions,
    suggestions,
    ats: checkAts(resumeText),
    ...(match
      ? {
          matchRate: match.matchRate,
          keywords: match.keywords,
          matched: match.matched,
          missing: match.missing,
        }
      : {}),
  };
}
