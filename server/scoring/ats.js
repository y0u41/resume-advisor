// ATS 真实性检测：检查简历能否被主流 ATS（简历筛选系统）正确解析。
// 纯确定性结构检查（不依赖 LLM），比通用打分更硬核、可复现。
// 关注点：可识别的姓名、联系方式字段、板块标题、日期格式、要点符号。

const RE = {
  phone: /1[3-9]\d{9}/,
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/,
  education: /(教育背景|教育经历|学历|教育)/,
  experience: /(工作经历|工作经验|实习经历|实习经历|工作经历|实习|工作|任职)/,
  projects: /(项目经历|项目经验|项目)/,
  skills: /(技能特长|专业技能|技能|技术栈)/,
  // 规范日期：YYYY-MM / YYYY.MM / YYYY/MM
  date: /\b(19|20)\d{2}\s*[.\-/]\s*(0?[1-9]|1[0-2])\b/,
  url: /https?:\/\//i,
};

function nonEmptyLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstNonEmptyLine(text) {
  return nonEmptyLines(text)[0] || "";
}

export function checkAts(resumeText) {
  const text = String(resumeText || "");
  const lines = nonEmptyLines(text);
  const first = firstNonEmptyLine(text);
  const checks = [];

  const add = (key, label, status, detail) => checks.push({ key, label, status, detail });

  // 1. 姓名（ATS 常取首行作为姓名）
  const hasName =
    first.length > 0 &&
    first.length <= 12 &&
    !RE.phone.test(first) &&
    !RE.email.test(first) &&
    !RE.url.test(first);
  add(
    "name",
    "姓名（首行可识别）",
    hasName ? "ok" : "warn",
    hasName ? "首行为姓名，ATS 可识别" : "建议首行单独放姓名，不要与联系方式同行"
  );

  // 2. 联系方式（ATS 必需）
  const hasContact = RE.phone.test(text) || RE.email.test(text);
  add(
    "contact",
    "联系方式字段",
    hasContact ? "ok" : "fail",
    hasContact ? "已包含手机或邮箱" : "缺少可识别的手机号 / 邮箱"
  );

  // 3. 邮箱格式
  const hasEmail = RE.email.test(text);
  add(
    "email",
    "邮箱",
    hasEmail ? "ok" : "warn",
    hasEmail ? "邮箱格式可识别" : "建议补充规范邮箱"
  );

  // 4~7. 板块标题
  const sectionChecks = [
    ["education", "教育板块标题", RE.education, "教育背景"],
    ["experience", "工作/实习板块标题", RE.experience, "工作经历 / 实习经历"],
    ["projects", "项目板块标题", RE.projects, "项目经历"],
    ["skills", "技能板块标题", RE.skills, "技能特长"],
  ];
  for (const [key, label, re, sample] of sectionChecks) {
    const ok = re.test(text);
    add(key, label, ok ? "ok" : "warn", ok ? `已识别「${sample}」类标题` : `建议使用标准标题，如「${sample}」`);
  }

  // 8. 日期格式规范
  const hasStandardDate = RE.date.test(text);
  add(
    "date",
    "日期格式（YYYY-MM）",
    hasStandardDate ? "ok" : "warn",
    hasStandardDate ? "存在规范日期（如 2023.08 / 2023-08）" : "建议统一为 YYYY-MM 或 YYYY.MM"
  );

  // 9. 要点符号（ATS 更易解析条目）
  const bullets = lines.filter((l) => /^[-*•·]|^\d+[.、)]/.test(l)).length;
  add(
    "bullets",
    "经历要点符号",
    bullets >= 2 ? "ok" : "warn",
    bullets >= 2 ? `含 ${bullets} 条要点` : "建议用「-」或数字列出经历要点"
  );

  const weight = { ok: 1, warn: 0.5, fail: 0 };
  const score = Math.round(
    (checks.reduce((s, c) => s + weight[c.status], 0) / checks.length) * 100
  );

  return { score, checks };
}
