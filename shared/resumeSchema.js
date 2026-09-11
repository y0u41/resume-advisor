// 结构化简历 Schema（单一事实来源）
//
// 权威定义：本文件（Zod）+ 类型声明 resumeSchema.d.ts。
// 传输与存储均为 JSON，字段名 camelCase。
// 写时严格校验（parseResumeContent）；读时宽松解析（safeParseResumeContent，失败回退空简历）。
// 未知字段按「丢弃」处理（Zod 对象默认 strip 语义）。
//
// 设计参考：resume-workshop 的 resume-schema（MIT License）。

import { z } from "zod";

export const RESUME_LIMITS = {
  name: 40,
  phone: 30,
  email: 100,
  city: 40,
  links: 10,
  summary: 500,
  education: 20,
  experience: 30,
  projects: 30,
  skills: 50,
  skillLen: 40,
  bullets: 10,
  bulletLen: 300,
  school: 80,
  company: 80,
  projectName: 80,
  role: 80,
  degree: 40,
  major: 80,
  desc: 300,
};

const optStr = (max) => z.string().max(max).optional().default("");
const optList = (item, max) => z.array(item).max(max).optional().default([]);

export const BasicsSchema = z.object({
  name: z.string().min(1).max(RESUME_LIMITS.name),
  phone: z.string().max(RESUME_LIMITS.phone).optional().default(""),
  email: z.string().max(RESUME_LIMITS.email).optional().default(""),
  city: z.string().max(RESUME_LIMITS.city).optional().default(""),
  links: optList(z.string().max(300), RESUME_LIMITS.links),
});

export const EducationSchema = z.object({
  school: z.string().min(1).max(RESUME_LIMITS.school),
  major: optStr(RESUME_LIMITS.major),
  degree: optStr(RESUME_LIMITS.degree),
  start: optStr(20),
  end: optStr(20),
});

export const ExperienceSchema = z.object({
  company: z.string().min(1).max(RESUME_LIMITS.company),
  role: optStr(RESUME_LIMITS.role),
  start: optStr(20),
  end: optStr(20),
  bullets: optList(z.string().max(RESUME_LIMITS.bulletLen), RESUME_LIMITS.bullets),
});

export const ProjectSchema = z.object({
  name: z.string().min(1).max(RESUME_LIMITS.projectName),
  role: optStr(RESUME_LIMITS.role),
  desc: optStr(RESUME_LIMITS.desc),
  bullets: optList(z.string().max(RESUME_LIMITS.bulletLen), RESUME_LIMITS.bullets),
});

export const ResumeContentSchema = z.object({
  schemaVersion: z.number().int().default(1),
  basics: BasicsSchema,
  summary: z.string().max(RESUME_LIMITS.summary).optional().default(""),
  education: optList(EducationSchema, RESUME_LIMITS.education),
  experience: optList(ExperienceSchema, RESUME_LIMITS.experience),
  projects: optList(ProjectSchema, RESUME_LIMITS.projects),
  skills: optList(z.string().max(RESUME_LIMITS.skillLen), RESUME_LIMITS.skills),
});

export function emptyResumeContent() {
  return {
    schemaVersion: 1,
    basics: { name: "", phone: "", email: "", city: "", links: [] },
    summary: "",
    education: [],
    experience: [],
    projects: [],
    skills: [],
  };
}

// 写时：严格校验，失败抛出（由调用方转成 4004 类错误）
export function parseResumeContent(input) {
  return ResumeContentSchema.parse(input);
}

// 读时：宽松解析，失败回退空简历，绝不抛错
export function safeParseResumeContent(input) {
  const result = ResumeContentSchema.safeParse(input);
  return result.success ? result.data : emptyResumeContent();
}

// 结构化 → 纯文本（供 LLM 评估与关键词匹配使用）
export function contentToText(content) {
  const c = content || emptyResumeContent();
  const b = c.basics || {};
  const lines = [];

  if (b.name) lines.push(b.name);
  const contact = [
    b.phone && `手机：${b.phone}`,
    b.email && `邮箱：${b.email}`,
    b.city && `城市：${b.city}`,
  ]
    .filter(Boolean)
    .join(" ｜ ");
  if (contact) lines.push(contact);
  if (Array.isArray(b.links) && b.links.length) lines.push(b.links.join(" "));

  if (c.summary) {
    lines.push("【自我评价】", c.summary);
  }

  if (Array.isArray(c.education) && c.education.length) {
    lines.push("【教育背景】");
    for (const e of c.education) {
      const head = [e.school, e.major, e.degree, [e.start, e.end].filter(Boolean).join("-")]
        .filter(Boolean)
        .join(" ｜ ");
      if (head) lines.push(head);
    }
  }

  if (Array.isArray(c.experience) && c.experience.length) {
    lines.push("【实习/工作经历】");
    for (const e of c.experience) {
      const head = [e.company, e.role, [e.start, e.end].filter(Boolean).join("-")]
        .filter(Boolean)
        .join(" ｜ ");
      if (head) lines.push(head);
      for (const bl of e.bullets || []) if (bl) lines.push(`- ${bl}`);
    }
  }

  if (Array.isArray(c.projects) && c.projects.length) {
    lines.push("【项目经历】");
    for (const p of c.projects) {
      const head = [p.name, p.role].filter(Boolean).join(" ｜ ");
      if (head) lines.push(head);
      if (p.desc) lines.push(p.desc);
      for (const bl of p.bullets || []) if (bl) lines.push(`- ${bl}`);
    }
  }

  if (Array.isArray(c.skills) && c.skills.length) {
    lines.push("【技能特长】", c.skills.join("、"));
  }

  return lines.filter((x) => x !== undefined && x !== null && x !== "").join("\n").trim();
}
