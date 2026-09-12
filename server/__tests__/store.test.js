import { describe, it, expect, beforeAll, beforeEach } from "vitest";

let saveEvaluation, MAX_PER_PERSON, db;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  ({ saveEvaluation, MAX_PER_PERSON } = await import("../core/store.js"));
  db = (await import("../core/db.js")).default;
});

beforeEach(() => {
  db.prepare("DELETE FROM evaluations").run();
});

const USER = 1;

describe("saveEvaluation 保留策略", () => {
  it("同一人提交超过上限，只保留最新 MAX_PER_PERSON 条", () => {
    const resume = "王五\nJava开发工程师";
    const n = MAX_PER_PERSON + 2;
    for (let i = 1; i <= n; i++) {
      saveEvaluation(USER, resume, "Java开发", "JD", i, `report-${i}`);
    }
    const count = db
      .prepare("SELECT COUNT(*) c FROM evaluations WHERE user_id = ?")
      .get(USER).c;
    expect(count).toBe(MAX_PER_PERSON);
    expect(MAX_PER_PERSON).toBe(30);
  });

  it("保留的是最新的记录", () => {
    const resume = "王五\nJava开发工程师";
    const n = MAX_PER_PERSON + 2;
    for (let i = 1; i <= n; i++) {
      saveEvaluation(USER, resume, "Java开发", "JD", i, `report-${i}`);
    }
    const reports = db
      .prepare("SELECT report FROM evaluations WHERE user_id = ? ORDER BY id")
      .all(USER)
      .map((r) => r.report);
    expect(reports).not.toContain("report-1");
    expect(reports).toContain(`report-${n}`);
  });

  it("最高分记录不会被自动清理", () => {
    const resume = "王五\nJava开发工程师";
    saveEvaluation(USER, resume, "Java开发", "JD", 10, "highest");
    for (let i = 1; i <= MAX_PER_PERSON + 2; i++) {
      saveEvaluation(USER, resume, "Java开发", "JD", 3, `low-${i}`);
    }
    const reports = db
      .prepare("SELECT report FROM evaluations WHERE user_id = ?")
      .all(USER)
      .map((r) => r.report);
    expect(reports).toContain("highest");
  });

  it("收藏的记录不会被自动清理", () => {
    const resume = "王五\nJava开发工程师";
    const favId = saveEvaluation(USER, resume, "Java开发", "JD", 2, "favorite");
    db.prepare("UPDATE evaluations SET favorite = 1 WHERE id = ?").run(favId);
    for (let i = 1; i <= MAX_PER_PERSON + 2; i++) {
      saveEvaluation(USER, resume, "Java开发", "JD", 3, `low-${i}`);
    }
    const reports = db
      .prepare("SELECT report FROM evaluations WHERE user_id = ?")
      .all(USER)
      .map((r) => r.report);
    expect(reports).toContain("favorite");
  });

  it("不同的人互不影响", () => {
    saveEvaluation(USER, "甲\nJava", "J", "", 1, "a");
    saveEvaluation(USER, "乙\n运营", "J", "", 2, "b");
    const count = db
      .prepare("SELECT COUNT(*) c FROM evaluations WHERE user_id = ?")
      .get(USER).c;
    expect(count).toBe(2);
  });

  it("不同用户的数据相互隔离", () => {
    saveEvaluation(1, "张三\nJava", "J", "", 1, "a");
    saveEvaluation(2, "张三\nJava", "J", "", 2, "b");
    const u1 = db.prepare("SELECT COUNT(*) c FROM evaluations WHERE user_id = 1").get().c;
    const u2 = db.prepare("SELECT COUNT(*) c FROM evaluations WHERE user_id = 2").get().c;
    expect(u1).toBe(1);
    expect(u2).toBe(1);
  });

  it("返回自增 id 且能保存 person 信息", () => {
    const id = saveEvaluation(USER, "丙\n测试", "岗位", "JD", 8, "报告");
    const row = db.prepare("SELECT * FROM evaluations WHERE id = ?").get(id);
    expect(row.person_name).toBe("丙");
    expect(row.job_title).toBe("岗位");
    expect(row.score).toBe(8);
    expect(row.user_id).toBe(USER);
  });
});
