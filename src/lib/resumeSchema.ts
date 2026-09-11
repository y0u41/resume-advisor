// 结构化简历 Schema 的前端桥接：
// - 复用 shared/resumeSchema.js（单一事实来源）
// - 提供 Builder 扁平表单（ResumeData）↔ 结构化（ResumeContent）的转换与校验
import { ResumeContentSchema, RESUME_LIMITS } from "../../shared/resumeSchema.js";
import type { ResumeContent } from "../../shared/resumeSchema.js";
import type { ResumeData } from "./resumeTemplate";

export type { ResumeContent } from "../../shared/resumeSchema.js";
export {
  safeParseResumeContent,
  emptyResumeContent,
  contentToText,
  RESUME_LIMITS,
} from "../../shared/resumeSchema.js";

function splitLines(s: string): string[] {
  return String(s || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// ResumeData（Builder 扁平表单）→ ResumeContent（结构化）
export function resumeDataToContent(d: ResumeData): ResumeContent {
  const eduLines = splitLines(d.education);
  const expLines = splitLines(d.experience);
  const projLines = splitLines(d.projects);
  const campusLines = splitLines(d.campus);

  const skills = String(d.skills || "")
    .split(/[、,，;；\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, RESUME_LIMITS.skills);

  const content: ResumeContent = {
    schemaVersion: 1,
    basics: {
      name: d.name.trim(),
      phone: d.phone.trim(),
      email: d.email.trim(),
      city: d.city.trim(),
      links: [],
    },
    summary: (d.intention ? `求职意向：${d.intention.trim()}\n` : "") + d.summary.trim(),
    education: eduLines.length
      ? [{ school: eduLines[0], major: "", degree: "", start: "", end: "" }]
      : [],
    experience: expLines.length
      ? [{ company: expLines[0], role: "", start: "", end: "", bullets: expLines.slice(1) }]
      : [],
    projects: projLines.length
      ? [{ name: projLines[0], role: "", desc: "", bullets: projLines.slice(1) }]
      : [],
    skills,
  };

  // 校园经历并入项目（保持结构简单）
  if (campusLines.length) {
    content.projects.push({ name: campusLines[0], role: "", desc: "", bullets: campusLines.slice(1) });
  }

  return content;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  content: ResumeContent;
}

// 校验 Builder 数据是否满足结构化 Schema；失败时返回字段级错误。
export function validateResumeData(d: ResumeData): ValidationResult {
  const content = resumeDataToContent(d);
  const result = ResumeContentSchema.safeParse(content);
  if (result.success) {
    return { ok: true, errors: [], content: result.data as ResumeContent };
  }
  const errors = (result.error?.issues || []).map(
    (i: any) => `${(i.path || []).join(".") || "内容"}: ${i.message}`
  );
  return { ok: false, errors, content };
}
