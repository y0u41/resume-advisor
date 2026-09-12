import { renderWorkshopResume } from "./workshopRender";

export type ResumeStyle = "classic" | "project" | "student";

export interface ResumeData {
  name: string;
  phone: string;
  email: string;
  city: string;
  intention: string;
  education: string;
  experience: string;
  projects: string;
  skills: string;
  campus: string;
  summary: string;
  photo: string;
}

export const EMPTY_RESUME: ResumeData = {
  name: "",
  phone: "",
  email: "",
  city: "",
  intention: "",
  education: "",
  experience: "",
  projects: "",
  skills: "",
  campus: "",
  summary: "",
  photo: "",
};

export const SAMPLE_RESUME: ResumeData = {
  name: "刘星宇",
  phone: "138-0000-0000",
  email: "liuxingyu@example.com",
  city: "武汉",
  intention: "Java 后端开发工程师",
  education:
    "华中科技大学 ｜ 计算机科学与技术 ｜ 本科 ｜ 2016.09 - 2020.06\n主修课程：数据结构与算法、操作系统、计算机网络、数据库原理、Java 程序设计",
  experience:
    "某互联网科技有限公司 ｜ Java 后端开发实习生 ｜ 2020.03 - 2020.06\n- 参与订单中心接口开发，基于 Spring Boot 编写 RESTful 接口 10+ 个\n- 使用 Redis 缓存热点数据，接口平均响应时间从 350ms 降至 120ms",
  projects:
    "校园图书管理系统（课程项目）｜ 后端开发 ｜ 2019.09 - 2019.12\n- 负责后端设计与实现，基于 Spring Boot + MySQL 完成图书借阅、查询、权限模块\n- 设计数据库表 8 张，实现分页查询与借阅状态流转，支撑 500+ 学生使用\n- 使用 Git 协作开发，编写接口文档（Swagger）",
  skills:
    "Java、Spring Boot、Spring Cloud、MySQL、Redis、RocketMQ、Linux、Git、Maven",
  campus:
    "校计算机协会 技术部负责人 ｜ 2017.09 - 2018.06\n- 组织 3 场编程入门讲座，累计参与 200+ 人次\n- 带队参加校程序设计大赛，获三等奖",
  summary:
    "计算机专业应届生，具备扎实的 Java 后端基础与完整的项目实践，学习能力强、责任心强，希望在真实业务中快速成长。",
  photo: "",
};

const SECTIONS: { key: keyof ResumeData; label: string }[] = [
  { key: "education", label: "教育背景" },
  { key: "projects", label: "项目经历" },
  { key: "experience", label: "实习/工作经历" },
  { key: "campus", label: "校园经历" },
  { key: "skills", label: "技能特长" },
  { key: "summary", label: "自我评价" },
];

const ORDER: Record<ResumeStyle, (keyof ResumeData)[]> = {
  classic: ["education", "experience", "projects", "campus", "skills", "summary"],
  project: ["projects", "experience", "skills", "education", "campus", "summary"],
  student: ["education", "projects", "campus", "experience", "skills", "summary"],
};

export const STYLE_LABELS: Record<ResumeStyle, string> = {
  classic: "经典简约",
  project: "项目优先",
  student: "应届生推荐",
};

const LABELS: Record<keyof ResumeData, string> = {
  name: "姓名",
  phone: "手机",
  email: "邮箱",
  city: "城市",
  intention: "求职意向",
  education: "教育背景",
  projects: "项目经历",
  experience: "实习 / 工作经历",
  campus: "校园经历",
  skills: "技能特长",
  summary: "自我评价",
  photo: "照片",
};

export type ResumeLayout =
  | "single"
  | "sidebar"
  | "clean-01"
  | "timeline-02"
  | "mono-line-03"
  | "blue-split-04";

export const LAYOUT_LABELS: Record<ResumeLayout, string> = {
  single: "单栏经典",
  sidebar: "左右分栏",
  "clean-01": "简洁单栏",
  "timeline-02": "时间轴",
  "mono-line-03": "黑色极简线条",
  "blue-split-04": "蓝色左右分栏",
};

// 4 套移植自 resume-workshop 的视觉模板（各自固定章节顺序）
export const WORKSHOP_LAYOUTS: ResumeLayout[] = [
  "clean-01",
  "timeline-02",
  "mono-line-03",
  "blue-split-04",
];

export function isWorkshopLayout(layout: ResumeLayout): boolean {
  return WORKSHOP_LAYOUTS.includes(layout);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 仅允许 data:image/* 的照片，避免注入非预期内容（渲染走 dangerouslySetInnerHTML）
function safePhoto(photo: string): string {
  return /^data:image\//i.test(photo || "") ? photo : "";
}

function sectionHtml(label: string, content: string): string {
  return `<section class="rsec">
    <h2 class="rsec-title">${label}</h2>
    <div class="rsec-body">${escapeHtml(content)}</div>
  </section>`;
}

// 单栏经典
function singleHtml(d: ResumeData, style: ResumeStyle): string {
  const contact = [
    d.phone.trim() && `手机：${escapeHtml(d.phone.trim())}`,
    d.email.trim() && `邮箱：${escapeHtml(d.email.trim())}`,
    d.city.trim() && `城市：${escapeHtml(d.city.trim())}`,
  ]
    .filter(Boolean)
    .join("　｜　");

  const sections = ORDER[style]
    .map((key) => {
      const content = (d[key] || "").trim();
      return content ? sectionHtml(LABELS[key], content) : "";
    })
    .join("");

  return `<div class="resume">
    <header class="rhead">
      <div class="rhead-main">
        <div class="rname">${escapeHtml(d.name.trim() || "姓名")}</div>
        ${contact ? `<div class="rcontact">${contact}</div>` : ""}
        ${d.intention.trim() ? `<div class="rintention">求职意向：${escapeHtml(d.intention.trim())}</div>` : ""}
      </div>
      ${safePhoto(d.photo) ? `<img class="rphoto" src="${safePhoto(d.photo)}" alt="" />` : ""}
    </header>
    ${sections}
  </div>`;
}

// 左右分栏
function sidebarHtml(d: ResumeData, style: ResumeStyle): string {
  const contactLines = [
    d.phone.trim() && `手机：${escapeHtml(d.phone.trim())}`,
    d.email.trim() && `邮箱：${escapeHtml(d.email.trim())}`,
    d.city.trim() && `城市：${escapeHtml(d.city.trim())}`,
  ].filter(Boolean);

  const sideBlocks: string[] = [];
  if (contactLines.length) {
    sideBlocks.push(
      `<div class="rside-block"><div class="rside-title">联系方式</div><div class="rside-body">${contactLines.join(
        "\n"
      )}</div></div>`
    );
  }
  if (d.skills.trim()) {
    sideBlocks.push(
      `<div class="rside-block"><div class="rside-title">技能特长</div><div class="rside-body">${escapeHtml(
        d.skills.trim()
      )}</div></div>`
    );
  }

  const mainSections = ORDER[style]
    .filter((key) => key !== "skills")
    .map((key) => {
      const content = (d[key] || "").trim();
      return content ? sectionHtml(LABELS[key], content) : "";
    })
    .join("");

  const photo = safePhoto(d.photo);

  return `<div class="resume resume-sidebar">
    <aside class="rside">
      ${sideBlocks.join("")}
    </aside>
    <main class="rmain">
      <div class="rmain-head">
        <div class="rmain-head-text">
          <div class="rname">${escapeHtml(d.name.trim() || "姓名")}</div>
          ${d.intention.trim() ? `<div class="rintention">求职意向：${escapeHtml(d.intention.trim())}</div>` : ""}
        </div>
        ${photo ? `<img class="rphoto-head" src="${photo}" alt="" />` : ""}
      </div>
      ${mainSections}
    </main>
  </div>`;
}

// 排版好的简历 HTML（用于实时预览与 PDF 导出）
export function resumeToHtml(
  d: ResumeData,
  style: ResumeStyle,
  layout: ResumeLayout = "single"
): string {
  if (isWorkshopLayout(layout)) {
    return `<div class="rtpl rtpl-${layout}">${renderWorkshopResume(d, layout)}</div>`;
  }
  return layout === "sidebar" ? sidebarHtml(d, style) : singleHtml(d, style);
}

export function buildResume(d: ResumeData, style: ResumeStyle): string {
  const lines: string[] = [];
  lines.push(d.name.trim() || "姓名");

  const contact = [
    d.phone.trim() && `手机：${d.phone.trim()}`,
    d.email.trim() && `邮箱：${d.email.trim()}`,
    d.city.trim() && `城市：${d.city.trim()}`,
  ]
    .filter(Boolean)
    .join(" ｜ ");
  if (contact) lines.push(contact);
  if (d.intention.trim()) lines.push(`求职意向：${d.intention.trim()}`);
  lines.push("");

  const byKey = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label])) as Record<string, string>;
  for (const key of ORDER[style]) {
    const content = (d[key] || "").trim();
    if (!content) continue;
    lines.push(`【${byKey[key]}】`);
    lines.push(content);
    lines.push("");
  }

  return lines.join("\n").trim();
}
