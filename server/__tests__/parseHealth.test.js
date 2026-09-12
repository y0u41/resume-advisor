import { describe, it, expect, beforeAll, beforeEach } from "vitest";

let parseHealth, db;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  process.env.PARSE_MIN_SAMPLES = "10";
  process.env.PARSE_DEGRADE_THRESHOLD = "0.05";
  ({ parseHealth } = await import("../core/parseHealth.js"));
  db = (await import("../core/db.js")).default;
});

beforeEach(() => {
  db.prepare("DELETE FROM events").run();
});

function seed(name, n) {
  const stmt = db.prepare("INSERT INTO events (name) VALUES (?)");
  for (let i = 0; i < n; i++) stmt.run(name);
}

describe("ADR-0007 解析降级率触发器", () => {
  it("样本不足时不触发（即使降级率很高）", () => {
    seed("report_parse", 5);
    seed("report_parse_fallback", 3);
    const h = parseHealth();
    expect(h.parses).toBe(5);
    expect(h.fallbacks).toBe(3);
    expect(h.rate).toBe(0.6);
    expect(h.enoughSamples).toBe(false);
    expect(h.shouldEnableMachineBlock).toBe(false);
  });

  it("样本足够但降级率未超阈值时不触发", () => {
    seed("report_parse", 200);
    seed("report_parse_fallback", 4);
    const h = parseHealth();
    expect(h.enoughSamples).toBe(true);
    expect(h.rate).toBe(0.02);
    expect(h.shouldEnableMachineBlock).toBe(false);
  });

  it("样本足够且降级率超阈值时触发", () => {
    seed("report_parse", 200);
    seed("report_parse_fallback", 20);
    const h = parseHealth();
    expect(h.enoughSamples).toBe(true);
    expect(h.rate).toBe(0.1);
    expect(h.shouldEnableMachineBlock).toBe(true);
  });

  it("无样本时降级率为 0、不触发", () => {
    const h = parseHealth();
    expect(h.parses).toBe(0);
    expect(h.rate).toBe(0);
    expect(h.shouldEnableMachineBlock).toBe(false);
  });
});
