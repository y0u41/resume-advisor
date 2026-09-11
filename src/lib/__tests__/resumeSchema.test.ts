import { describe, it, expect } from "vitest";
import { resumeDataToContent, validateResumeData } from "../resume/resumeSchema";
import {
  safeParseResumeContent,
  contentToText,
  emptyResumeContent,
} from "../../../shared/resumeSchema.js";
import { SAMPLE_RESUME } from "../resume/resumeTemplate";

describe("结构化简历 Schema", () => {
  it("合法数据通过校验并保留关键字段", () => {
    const r = validateResumeData(SAMPLE_RESUME);
    expect(r.ok).toBe(true);
    expect(r.content.basics.name).toBe("刘星宇");
    expect(r.content.skills.length).toBeGreaterThan(0);
  });

  it("缺少姓名时校验失败并给出字段级错误（写严）", () => {
    const r = validateResumeData({ ...SAMPLE_RESUME, name: "" });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/basics\.name/);
  });

  it("safeParse 失败回退空简历（读宽）", () => {
    expect(safeParseResumeContent({ foo: 1 })).toEqual(emptyResumeContent());
  });

  it("未知字段被丢弃", () => {
    const c = safeParseResumeContent({
      ...emptyResumeContent(),
      hacker: true,
      basics: { name: "张三" },
    });
    expect((c as any).hacker).toBeUndefined();
  });

  it("结构化 → 文本包含关键信息", () => {
    const text = contentToText(resumeDataToContent(SAMPLE_RESUME));
    expect(text).toContain("刘星宇");
    expect(text).toContain("【技能特长】");
    expect(text).toContain("Java");
  });
});
