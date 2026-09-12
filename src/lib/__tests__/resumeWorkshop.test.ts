import { describe, it, expect } from "vitest";
import { resumeToHtml, WORKSHOP_LAYOUTS, SAMPLE_RESUME } from "../resume/resumeTemplate";
import { resumeDataToScope } from "../resume/workshopRender";
import { renderTemplate } from "../resume/render";

describe("workshop 模板渲染", () => {
  it("把 ｜ 分隔的首行解析成结构化条目", () => {
    const scope = resumeDataToScope(SAMPLE_RESUME);
    const edu = scope.education as any[];
    expect(edu[0].school).toBe("华中科技大学");
    expect(edu[0].major).toBe("计算机科学与技术");
    expect(edu[0].degree).toBe("本科");
    expect(edu[0].start).toBe("2016.09");
    expect(edu[0].end).toBe("2020.06");
    expect(edu[0].extra).toContain("主修课程");

    const exp = scope.experience as any[];
    expect(exp[0].company).toBe("某互联网科技有限公司");
    expect(exp[0].start).toBe("2020.03");
    expect(exp[0].bullets.length).toBeGreaterThan(0);

    expect((scope.skills as string[]).length).toBeGreaterThan(0);
  });

  it("每套模板都渲染出姓名与主要章节", () => {
    for (const code of WORKSHOP_LAYOUTS) {
      const html = resumeToHtml(SAMPLE_RESUME, "student", code);
      expect(html).toContain("刘星宇");
      expect(html).toContain(`rtpl-${code}`);
      expect(html).toContain("教育背景");
      expect(html).toContain("技能");
    }
  });

  it("照片仅在 data:image 时输出", () => {
    const withPhoto = resumeToHtml(
      { ...SAMPLE_RESUME, photo: "data:image/png;base64,AAAA" },
      "student",
      "clean-01"
    );
    expect(withPhoto).toContain('class="tpl-photo"');

    const badPhoto = resumeToHtml(
      { ...SAMPLE_RESUME, photo: "https://evil.example/x.png" },
      "student",
      "clean-01"
    );
    expect(badPhoto).not.toContain("tpl-photo");
  });

  it("用户内容一律 HTML 转义", () => {
    const html = resumeToHtml(
      { ...SAMPLE_RESUME, name: "<script>alert(1)</script>" },
      "student",
      "mono-line-03"
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("未知路径渲染为空串、不抛错", () => {
    expect(renderTemplate("a{{missing.path}}b", {})).toBe("ab");
    expect(renderTemplate("{{#if nope}}x{{/if}}", {})).toBe("");
  });
});
