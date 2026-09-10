import { describe, it, expect, beforeAll, beforeEach } from "vitest";

let saveEvaluation, MAX_PER_PERSON, db;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  ({ saveEvaluation, MAX_PER_PERSON } = await import("../store.js"));
  db = (await import("../db.js")).default;
});

beforeEach(() => {
  db.prepare("DELETE FROM evaluations").run();
});

describe("saveEvaluation 保留策略", () => {
  it("同一人提交 13 次，只保留最新 12 条", () => {
    const resume = "王五\nJava开发工程师";
    for (let i = 1; i <= 13; i++) {
      saveEvaluation(resume, "Java开发", "JD", 5, `report-${i}`);
    }
    const count = db.prepare("SELECT COUNT(*) c FROM evaluations").get().c;
    expect(count).toBe(MAX_PER_PERSON);
    expect(MAX_PER_PERSON).toBe(12);
  });

  it("保留的是最新的记录", () => {
    const resume = "王五\nJava开发工程师";
    for (let i = 1; i <= 13; i++) {
      saveEvaluation(resume, "Java开发", "JD", 5, `report-${i}`);
    }
    const reports = db
      .prepare("SELECT report FROM evaluations ORDER BY id")
      .all()
      .map((r) => r.report);
    expect(reports).not.toContain("report-1");
    expect(reports).toContain("report-13");
  });

  it("不同的人互不影响", () => {
    saveEvaluation("甲\nJava", "J", "", 1, "a");
    saveEvaluation("乙\n运营", "J", "", 2, "b");
    const count = db.prepare("SELECT COUNT(*) c FROM evaluations").get().c;
    expect(count).toBe(2);
  });

  it("返回自增 id 且能保存 person 信息", () => {
    const id = saveEvaluation("丙\n测试", "岗位", "JD", 8, "报告");
    const row = db.prepare("SELECT * FROM evaluations WHERE id = ?").get(id);
    expect(row.person_name).toBe("丙");
    expect(row.job_title).toBe("岗位");
    expect(row.score).toBe(8);
  });
});
