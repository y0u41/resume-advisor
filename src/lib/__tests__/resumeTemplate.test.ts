import { describe, it, expect } from "vitest";
import { buildResume, EMPTY_RESUME, SAMPLE_RESUME } from "../resumeTemplate";

describe("buildResume", () => {
  it("包含姓名、联系方式与求职意向", () => {
    const text = buildResume(SAMPLE_RESUME, "student");
    expect(text).toContain("刘星宇");
    expect(text).toContain("手机：138-0000-0000");
    expect(text).toContain("求职意向：Java 后端开发工程师");
  });

  it("应届生风格：教育背景在项目经历之前", () => {
    const text = buildResume(SAMPLE_RESUME, "student");
    expect(text.indexOf("【教育背景】")).toBeLessThan(text.indexOf("【项目经历】"));
  });

  it("项目优先风格：项目经历在教育背景之前", () => {
    const text = buildResume(SAMPLE_RESUME, "project");
    expect(text.indexOf("【项目经历】")).toBeLessThan(text.indexOf("【教育背景】"));
  });

  it("空内容不产生空章节", () => {
    const text = buildResume(EMPTY_RESUME, "classic");
    expect(text).not.toContain("【教育背景】");
    expect(text).not.toContain("【项目经历】");
    expect(text.trim()).toBe("姓名");
  });

  it("只填部分内容时只输出对应章节", () => {
    const text = buildResume({ ...EMPTY_RESUME, name: "张三", skills: "Java" }, "classic");
    expect(text).toContain("【技能特长】");
    expect(text).toContain("Java");
    expect(text).not.toContain("【项目经历】");
  });
});
