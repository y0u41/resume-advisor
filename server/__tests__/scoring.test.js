import { describe, it, expect } from "vitest";
import { evaluateResume, extractKeywords, normalizeText, checkAts } from "../scoring/index.js";

const goodResume = `张三
联系方式：13800138000 邮箱：zhangsan@example.com 城市：杭州
自我评价：3 年前端开发经验，熟悉主流前端技术栈。
教育经历：浙江大学 计算机科学与技术 本科 2019-09 至 2023-06
工作经历：某科技公司 前端开发 2023-07 至 2024-06
- 使用 Vue3 与 TypeScript 重构核心页面，首屏加载时间下降 40%
- 负责 3 个模块
项目经历：简历助手 前端负责人
- 编写单元测试，测试覆盖率从 30% 提升到 80%
技能：JavaScript、TypeScript、Vue3、Node.js`;

const sampleJd = `岗位职责：负责前端开发。
任职要求：
1. 精通 JavaScript、TypeScript，熟悉 Vue3；
2. 具备性能优化与单元测试经验；
3. 有良好的沟通能力与学习能力。`;

describe("确定性评分引擎", () => {
  it("关键词抽取：英文词边界（java 不命中 javascript）", () => {
    const canon = extractKeywords("精通 JavaScript 开发").map((k) => k.canonical);
    expect(canon).toContain("javascript");
    expect(canon).not.toContain("java");
  });

  it("关键词抽取：别名归一（vue3 → vue）", () => {
    const canon = extractKeywords("熟悉 Vue3 与 TypeScript").map((k) => k.canonical);
    expect(canon).toContain("vue");
    expect(canon).toContain("typescript");
  });

  it("有 JD：四维、权重和为 1、matchRate 较高、缺失项含学习能力", () => {
    const r = evaluateResume(goodResume, { jdText: sampleJd });
    expect(r.dimensions).toHaveLength(4);
    const sum = r.dimensions.reduce((s, d) => s + d.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    expect(r.matchRate).toBeGreaterThan(0.5);
    expect(r.missing.map((m) => m.canonical)).toContain("学习能力");
  });

  it("无 JD：三维、权重和为 1、无 matchRate", () => {
    const r = evaluateResume(goodResume);
    expect(r.dimensions).toHaveLength(3);
    expect(r.matchRate).toBeUndefined();
    const sum = r.dimensions.reduce((s, d) => s + d.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("确定性：相同输入结果深度相等", () => {
    const a = evaluateResume(goodResume, { jdText: sampleJd });
    const b = evaluateResume(goodResume, { jdText: sampleJd });
    expect(a).toEqual(b);
  });

  it("弱简历：matchRate = 0、总分较低", () => {
    const r = evaluateResume("李四\n爱好：打篮球", { jdText: sampleJd });
    expect(r.matchRate).toBe(0);
    expect(r.score).toBeLessThan(40);
  });

  it("量化：含 40% / 1000 用户 / 3 个模块 → 量化维度满分", () => {
    const text = `王五
- 性能提升 40%
- 服务 1000 用户
- 负责 3 个模块
- 参与日常开发`;
    const r = evaluateResume(text);
    const q = r.dimensions.find((d) => d.name === "quantification");
    expect(q.score).toBe(100);
  });

  it("归一化：全角转半角、大小写统一、折叠空白", () => {
    expect(normalizeText("ＶＵＥ３　ＡＢＣ")).toBe("vue3 abc");
  });

  it("外部关键词（LLM 抽取）：覆盖任意行业，匹配仍确定", () => {
    const resume = "张三\n负责社群运营与用户增长，策划 3 场活动，拉新 2000 人\n技能：Excel、数据分析";
    const jd = "岗位：社群运营。要求：社群运营、用户增长、活动策划、数据分析、Excel、短视频。";
    const jdKeywords = ["社群运营", "用户增长", "活动策划", "数据分析", "Excel", "短视频"];
    const r = evaluateResume(resume, { jdText: jd, jdKeywords });
    expect(r.dimensions).toHaveLength(4);
    const kws = r.keywords.map((k) => k.canonical);
    expect(kws).toEqual(expect.arrayContaining(jdKeywords));
    expect(r.missing.map((m) => m.canonical)).toContain("短视频");
    expect(r.matchRate).toBeGreaterThan(0.5);
    // 相同输入结果一致（确定性）
    expect(evaluateResume(resume, { jdText: jd, jdKeywords })).toEqual(r);
  });

  it("ATS 结构检查：规范简历得分高", () => {
    const good = `张三
手机：13800138000 邮箱：zs@example.com
教育背景
东北石油大学 通信工程 本科 2023.08 - 2027.06
工作经历
某公司 前端 2024.01 - 2024.06
- 负责页面开发
- 优化性能 40%
项目经历
简历助手 2024.02 - 2024.03
技能特长
C++、JavaScript`;
    const r = checkAts(good);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.checks.find((c) => c.key === "contact").status).toBe("ok");
    expect(r.checks.find((c) => c.key === "education").status).toBe("ok");
  });

  it("ATS 结构检查：缺联系方式判为 fail", () => {
    const r = checkAts("张三\n爱好打篮球");
    expect(r.checks.find((c) => c.key === "contact").status).toBe("fail");
    expect(r.score).toBeLessThan(60);
  });

  it("ATS 日期：中文「2023年8月」不再误报", () => {
    const cn = `张三
手机：13800138000
教育背景
东北石油大学 通信工程 本科 2023年8月 - 2027年6月
工作经历
某公司 2024年1月 - 2024年6月
- 负责开发
- 优化 40%
项目经历
简历助手 2024年2月
技能特长
C++`;
    expect(checkAts(cn).checks.find((c) => c.key === "date").status).toBe("ok");
    // 仅年份也应可接受
    expect(checkAts("张三\n2023年 - 2027年\n手机 13800138000").checks.find((c) => c.key === "date").status).toBe("ok");
  });
});
