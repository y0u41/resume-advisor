import { describe, it, expect, beforeAll, beforeEach } from "vitest";

let consumeQuota, getUsage, db;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  ({ consumeQuota, getUsage } = await import("../quota.js"));
  db = (await import("../db.js")).default;
});

beforeEach(() => {
  db.prepare("DELETE FROM usage_log").run();
});

describe("每日额度", () => {
  it("未超出限额时允许并累计", () => {
    expect(consumeQuota(1, 3).allowed).toBe(true);
    expect(consumeQuota(1, 3).allowed).toBe(true);
    expect(getUsage(1)).toBe(2);
  });

  it("达到限额后拒绝", () => {
    consumeQuota(1, 2);
    consumeQuota(1, 2);
    const r = consumeQuota(1, 2);
    expect(r.allowed).toBe(false);
    expect(r.used).toBe(2);
  });

  it("不同用户额度独立", () => {
    consumeQuota(1, 1);
    expect(consumeQuota(1, 1).allowed).toBe(false);
    expect(consumeQuota(2, 1).allowed).toBe(true);
  });
});
