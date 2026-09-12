import { describe, it, expect, beforeAll, beforeEach } from "vitest";

let guestVariant, guestExperimentStats, db;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  process.env.GUEST_AB_LIMITS = "3,5";
  process.env.GUEST_AB_PREVIEW = "800,1500";
  process.env.GUEST_AB_MIN_SAMPLE = "100";
  ({ guestVariant, guestExperimentStats } = await import("../core/experiments.js"));
  db = (await import("../core/db.js")).default;
});

beforeEach(() => {
  db.prepare("DELETE FROM events").run();
});

describe("游客转化实验", () => {
  it("按 IP 稳定分桶：同一 IP 结果一致，且取值只在两组内", () => {
    const a1 = guestVariant("1.2.3.4");
    const a2 = guestVariant("1.2.3.4");
    expect(a1).toEqual(a2);
    expect([3, 5]).toContain(a1.limit);
    expect([800, 1500]).toContain(a1.preview);
  });

  it("不同 IP 会分到两组（抽样中两组都出现）", () => {
    const limits = new Set();
    const previews = new Set();
    for (let i = 0; i < 50; i++) {
      const v = guestVariant(`10.0.0.${i}`);
      limits.add(v.limit);
      previews.add(v.preview);
    }
    expect(limits.size).toBe(2);
    expect(previews.size).toBe(2);
  });

  it("统计：按次数 / 按预览分组算 试用→注册 转化率", () => {
    const ev = db.prepare("INSERT INTO events (name, meta) VALUES (?, ?)");
    for (let i = 0; i < 4; i++) ev.run("guest_trial", JSON.stringify({ limit: 3, preview: 800 }));
    for (let i = 0; i < 4; i++) ev.run("guest_trial", JSON.stringify({ limit: 5, preview: 1500 }));
    ev.run("register_from_guest", JSON.stringify({ limit: 3, preview: 800 }));
    ev.run("register_from_guest", JSON.stringify({ limit: 5, preview: 1500 }));
    ev.run("register_from_guest", JSON.stringify({ limit: 5, preview: 1500 }));

    const s = guestExperimentStats();
    expect(s.active).toBe(true);
    const l3 = s.byLimit.find((g) => g.value === 3);
    const l5 = s.byLimit.find((g) => g.value === 5);
    expect(l3).toMatchObject({ trials: 4, registers: 1, rate: 25 });
    expect(l5).toMatchObject({ trials: 4, registers: 2, rate: 50 });
    const p800 = s.byPreview.find((g) => g.value === 800);
    const p1500 = s.byPreview.find((g) => g.value === 1500);
    expect(p800).toMatchObject({ trials: 4, registers: 1, rate: 25 });
    expect(p1500).toMatchObject({ trials: 4, registers: 2, rate: 50 });
    // 4 < 100：样本不足，结论仅供参考
    expect(s.minSample).toBe(100);
    expect(s.enoughSamples).toBe(false);
    expect(l3.enough).toBe(false);
    expect(p1500.enough).toBe(false);
  });

  it("样本量阈值：单组达到最小样本量才标记充足", () => {
    const ev = db.prepare("INSERT INTO events (name, meta) VALUES (?, ?)");
    for (let i = 0; i < 100; i++) ev.run("guest_trial", JSON.stringify({ limit: 3, preview: 800 }));
    for (let i = 0; i < 100; i++) ev.run("guest_trial", JSON.stringify({ limit: 5, preview: 1500 }));
    ev.run("register_from_guest", JSON.stringify({ limit: 5, preview: 1500 }));

    const s = guestExperimentStats();
    expect(s.byLimit.every((g) => g.enough)).toBe(true);
    expect(s.byPreview.every((g) => g.enough)).toBe(true);
    expect(s.enoughSamples).toBe(true);
  });
});
