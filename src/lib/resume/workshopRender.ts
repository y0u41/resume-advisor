// 把 Builder 的扁平表单（ResumeData）转成 4 套视觉模板所需的渲染作用域。
// 说明：模板来自 resume-workshop（MIT License），使用结构化占位符；这里把
// 「首行用 ｜ 分隔的字段 + 后续行项目符号」解析成结构化条目，尽量无损。
import { renderTemplate, type RenderScope } from "./render";
import { findWorkshopTemplate } from "./templates";
import type { ResumeData } from "./resumeTemplate";

function splitLines(s: string): string[] {
  return String(s || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitParts(line: string): string[] {
  return String(line || "")
    .split(/[｜|]/)
    .map((x) => x.trim());
}

function splitRange(s: string): [string, string] {
  const parts = String(s || "")
    .split(/\s*[-–—~至]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  return [parts[0] || "", parts[1] || ""];
}

function stripBullet(line: string): string {
  return line.replace(/^[-•·*]\s*/, "").trim();
}

function tailBullets(lines: string[]): string[] {
  return lines.slice(1).map(stripBullet).filter(Boolean);
}

// 教育：首行「学校 ｜ 专业 ｜ 学历 ｜ 起止时间」，其余行作为补充（如主修课程）
function parseEducation(text: string) {
  const lines = splitLines(text);
  if (!lines.length) return [];
  const parts = splitParts(lines[0]);
  const [start, end] = splitRange(parts[3] || "");
  return [
    {
      school: parts[0] || "",
      major: parts[1] || "",
      degree: parts[2] || "",
      start,
      end,
      extra: lines.slice(1).join("\n"),
    },
  ];
}

// 工作：首行「公司 ｜ 岗位 ｜ 起止时间」，其余行为要点
function parseExperience(text: string) {
  const lines = splitLines(text);
  if (!lines.length) return [];
  const parts = splitParts(lines[0]);
  const [start, end] = splitRange(parts[2] || "");
  return [{ company: parts[0] || "", role: parts[1] || "", start, end, bullets: tailBullets(lines) }];
}

// 项目 / 校园：首行「名称 ｜ 角色 ｜ 起止时间」，其余行为要点
function parseProjects(text: string) {
  const lines = splitLines(text);
  if (!lines.length) return [];
  const parts = splitParts(lines[0]);
  return [{ name: parts[0] || "", role: parts[1] || "", desc: "", bullets: tailBullets(lines) }];
}

// 仅允许 data:image/* 的照片，避免注入非预期内容
function safePhoto(photo: string): string {
  return /^data:image\//i.test(photo || "") ? photo : "";
}

export function resumeDataToScope(d: ResumeData): RenderScope {
  const skills = String(d.skills || "")
    .split(/[、,，;；\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  const projects = [...parseProjects(d.projects), ...parseProjects(d.campus)];

  return {
    basics: {
      name: d.name.trim(),
      phone: d.phone.trim(),
      email: d.email.trim(),
      city: d.city.trim(),
      links: [],
    },
    summary: d.summary.trim(),
    intention: d.intention.trim(),
    education: parseEducation(d.education),
    experience: parseExperience(d.experience),
    projects,
    skills,
    photo: safePhoto(d.photo),
  };
}

// 渲染 4 套视觉模板之一 → HTML 片段（预览与 PDF 导出共用）
export function renderWorkshopResume(d: ResumeData, code: string): string {
  const tpl = findWorkshopTemplate(code);
  if (!tpl) return "";
  return renderTemplate(tpl.html, resumeDataToScope(d));
}
