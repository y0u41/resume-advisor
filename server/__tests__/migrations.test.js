import { describe, it, expect, beforeAll } from "vitest";

let db, migrate, MIGRATIONS;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  ({ default: db, migrate, MIGRATIONS } = await import("../core/db.js"));
});

describe("数据库版本化迁移（user_version 顺序回放）", () => {
  it("新库：版本推进到最新，关键表全部存在", () => {
    expect(db.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((t) => t.name);
    for (const t of [
      "users",
      "evaluations",
      "quota_counters",
      "jd_keywords",
      "guest_trials",
      "events",
      "feedback",
      "llm_usage",
      "pro_requests",
      "downloads",
    ]) {
      expect(tables).toContain(t);
    }
  });

  it("关键新增列已建好（plan / plan_expires_at / share_hide_name / pay_email）", () => {
    const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    expect(cols("users")).toEqual(
      expect.arrayContaining(["plan", "plan_expires_at", "deleted_at", "purge_after"])
    );
    expect(cols("evaluations")).toEqual(
      expect.arrayContaining(["share_hide_name", "share_expires_at", "objective_json", "revision"])
    );
    expect(cols("pro_requests")).toContain("pay_email");
  });

  it("幂等：再跑一次 migrate 不抛错、版本不变", () => {
    const before = db.pragma("user_version", { simple: true });
    expect(() => migrate()).not.toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(before);
  });

  it("迁移编号连续且唯一（v = 1..N）", () => {
    expect(MIGRATIONS.map((m) => m.v)).toEqual(
      Array.from({ length: MIGRATIONS.length }, (_, i) => i + 1)
    );
  });
});
