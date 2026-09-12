import db from "./db.js";

// 岗位大类：顺序即匹配优先级（先匹配到的胜出）；"other" 作为兜底。
export const CATEGORIES = [
  {
    slug: "frontend",
    label: "前端开发",
    match: ["前端", "web前端", "h5", "小程序", "react", "vue", "angular", "javascript", "typescript", "css", "web开发"],
  },
  {
    slug: "backend",
    label: "后端开发",
    match: ["后端", "服务端", "java", "golang", "go开发", "python", "node", "php", "c++", "c#", "spring", "golang开发"],
  },
  {
    slug: "mobile",
    label: "移动端开发",
    match: ["android", "ios", "移动端", "客户端", "flutter", "鸿蒙", "harmony"],
  },
  {
    slug: "algorithm",
    label: "算法 / 数据",
    match: ["算法", "机器学习", "深度学习", "数据", "ai", "人工智能", "大模型", "nlp", "cv", "推荐", "爬虫"],
  },
  { slug: "test", label: "测试", match: ["测试", "qa", "质量"] },
  {
    slug: "ops",
    label: "运维 / 云",
    match: ["运维", "devops", "sre", "云", "k8s", "kubernetes", "网络工程", "安全"],
  },
  {
    slug: "hardware",
    label: "硬件 / 嵌入式",
    match: ["嵌入式", "硬件", "电子", "单片机", "fpga", "通信", "射频", "dsp", "电气"],
  },
  { slug: "design", label: "设计", match: ["设计", "ui", "ux", "视觉", "交互", "美术"] },
  {
    slug: "operations",
    label: "运营 / 市场",
    match: ["运营", "市场", "新媒体", "内容", "增长", "品牌", "商务", "营销", "编辑"],
  },
  { slug: "product", label: "产品", match: ["产品经理", "产品"] },
  { slug: "sales", label: "销售 / 客服", match: ["销售", "客服", "客户", "电销"] },
  {
    slug: "support",
    label: "财务 / 人事 / 行政",
    match: ["财务", "会计", "人事", "hr", "行政", "法务", "出纳"],
  },
  { slug: "other", label: "其他", match: [] },
];

const CATEGORY_INDEX = new Map(CATEGORIES.map((c, i) => [c.slug, i]));

// 过泛、非「技能/关键词」的词，清洗时剔除
const STOPWORDS = new Set([
  "其他", "以上", "相关", "优先", "要求", "职责", "工作", "岗位", "公司", "团队",
  "能力", "经验", "熟悉", "了解", "具备", "负责", "掌握", "优先考虑", "加分项",
]);

export function categoryOf(title) {
  const t = String(title || "").toLowerCase();
  for (const c of CATEGORIES) {
    if (c.match.some((m) => t.includes(m))) return { slug: c.slug, label: c.label };
  }
  return { slug: "other", label: "其他" };
}

// 轻清洗：去首尾符号、去纯符号/纯数字、去过短与过泛词
export function cleanKeyword(raw) {
  let s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  s = s.replace(/^[\s,，、;；:：/|·•\-–—]+/, "").replace(/[\s,，、;；:：/|·•\-–—]+$/, "");
  if (!s) return "";
  if (!/[\u4e00-\u9fffA-Za-z]/.test(s)) return "";
  if (s.length < 2) return "";
  if (STOPWORDS.has(s)) return "";
  return s;
}

// 聚合 jd_keywords → 岗位关键词库
export function buildLibrary({ minJd = 1, keywordLimit = 120 } = {}) {
  const rows = db
    .prepare(
      "SELECT job_title, keywords FROM jd_keywords WHERE job_title IS NOT NULL AND job_title <> ''"
    )
    .all();
  const cats = new Map();
  const allKeywords = new Map();
  let totalJds = 0;

  for (const row of rows) {
    totalJds++;
    const cat = categoryOf(row.job_title);
    let entry = cats.get(cat.slug);
    if (!entry) {
      entry = { slug: cat.slug, label: cat.label, jdCount: 0, keywords: new Map() };
      cats.set(cat.slug, entry);
    }
    entry.jdCount++;

    let arr = [];
    try {
      arr = JSON.parse(row.keywords);
    } catch {
      arr = [];
    }
    if (!Array.isArray(arr)) continue;

    const seen = new Set();
    for (const raw of arr) {
      const w = cleanKeyword(raw);
      if (!w) continue;
      const key = w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const e = entry.keywords.get(key) || { word: w, count: 0 };
      e.count++;
      entry.keywords.set(key, e);

      const a = allKeywords.get(key) || { word: w, count: 0 };
      a.count++;
      allKeywords.set(key, a);
    }
  }

  const categories = [...cats.values()]
    .map((c) => ({
      slug: c.slug,
      label: c.label,
      jdCount: c.jdCount,
      keywords: [...c.keywords.values()]
        .filter((k) => k.count >= minJd)
        .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
        .slice(0, keywordLimit),
    }))
    .filter((c) => c.keywords.length > 0)
    .sort(
      (a, b) =>
        b.jdCount - a.jdCount ||
        (CATEGORY_INDEX.get(a.slug) ?? 99) - (CATEGORY_INDEX.get(b.slug) ?? 99)
    );

  const topKeywords = [...allKeywords.values()]
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, keywordLimit);

  const updatedAt =
    db.prepare("SELECT MAX(updated_at) AS m FROM jd_keywords").get()?.m || null;

  return {
    updatedAt,
    totalJds,
    totalKeywords: allKeywords.size,
    categories,
    topKeywords,
  };
}

export function findCategory(slug) {
  return buildLibrary().categories.find((c) => c.slug === slug) || null;
}
