import { describe, it, expect, beforeAll, beforeEach } from "vitest";

let consumeQuota, refundQuota, getUsage, getPremiumUsage, db;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  process.env.FREE_DAILY_LIMIT = "3";
  process.env.PRO_DAILY_LIMIT = "10";
  process.env.FREE_PREMIUM_DAILY = "1";
  process.env.PRO_PREMIUM_DAILY = "5";
  ({ consumeQuota, refundQuota, getUsage, getPremiumUsage } = await import("../core/quota.js"));
  db = (await import("../core/db.js")).default;
});

beforeEach(() => {
  db.prepare("DELETE FROM quota_counters").run();
});

const free = { id: 1, role: "user", plan: "free" };
const pro = { id: 2, role: "user", plan: "pro" };
const admin = { id: 3, role: "admin", plan: "free" };

describe("每日额度（按套餐分层）", () => {
  it("免费档达到 FREE_DAILY_LIMIT 后拒绝", () => {
    expect(consumeQuota(free).allowed).toBe(true);
    expect(consumeQuota(free).allowed).toBe(true);
    expect(consumeQuota(free).allowed).toBe(true);
    const r = consumeQuota(free);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("daily");
    expect(r.limit).toBe(3);
    expect(getUsage(1)).toBe(3);
  });

  it("PRO 档额度更高", () => {
    for (let i = 0; i < 3; i++) consumeQuota(free);
    expect(consumeQuota(free).allowed).toBe(false);
    expect(consumeQuota(pro).allowed).toBe(true);
    expect(consumeQuota(pro).limit).toBe(10);
  });

  it("高级模型单独计数：免费档尝鲜用尽后拒绝 premium，普通额度仍可用", () => {
    expect(consumeQuota(free, { isPremium: true }).allowed).toBe(true);
    const r = consumeQuota(free, { isPremium: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("premium");
    expect(getPremiumUsage(1)).toBe(1);
    expect(consumeQuota(free).allowed).toBe(true);
  });

  it("管理员不受限且不计数", () => {
    for (let i = 0; i < 50; i++) {
      expect(consumeQuota(admin).allowed).toBe(true);
      expect(consumeQuota(admin, { isPremium: true }).allowed).toBe(true);
    }
    expect(getUsage(3)).toBe(0);
    expect(getPremiumUsage(3)).toBe(0);
  });

  it("不同用户额度独立", () => {
    consumeQuota(free);
    consumeQuota(free);
    consumeQuota(free);
    expect(consumeQuota(free).allowed).toBe(false);
    expect(consumeQuota({ id: 9, role: "user", plan: "free" }).allowed).toBe(true);
  });
});

describe("额度退还（评估失败时，避免「失败了次数却少了」）", () => {
  it("退还 total，premium 也同步退还", () => {
    consumeQuota(free, { isPremium: true });
    expect(getUsage(1)).toBe(1);
    expect(getPremiumUsage(1)).toBe(1);
    refundQuota(free.id, { isPremium: true });
    expect(getUsage(1)).toBe(0);
    expect(getPremiumUsage(1)).toBe(0);
  });

  it("退还后额度可再次使用（不会卡住）", () => {
    consumeQuota(free);
    refundQuota(free.id);
    expect(consumeQuota(free).allowed).toBe(true);
    expect(getUsage(1)).toBe(1);
  });

  it("不会退成负数", () => {
    refundQuota(free.id);
    expect(getUsage(1)).toBe(0);
  });

  it("管理员不计数，退还也是 no-op", () => {
    consumeQuota(admin);
    refundQuota(admin.id);
    expect(getUsage(3)).toBe(0);
  });
});
