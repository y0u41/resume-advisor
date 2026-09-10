import { describe, it, expect } from "vitest";
import { acquire, queueStats } from "../queue.js";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("并发队列", () => {
  it("并发上限内立即执行", async () => {
    const max = queueStats().maxConcurrency;
    const releases = [];
    for (let i = 0; i < max; i++) {
      releases.push(await acquire());
    }
    expect(queueStats().active).toBe(max);
    expect(queueStats().waiting).toBe(0);
    releases.forEach((r) => r());
    expect(queueStats().active).toBe(0);
  });

  it("超出上限时排队，释放后依次执行", async () => {
    const max = queueStats().maxConcurrency;
    const releases = [];
    for (let i = 0; i < max; i++) releases.push(await acquire());

    let position = -1;
    let resolved = false;
    const pending = acquire((pos) => {
      position = pos;
    }).then((release) => {
      resolved = true;
      return release;
    });

    await tick();
    expect(position).toBe(1);
    expect(resolved).toBe(false);

    releases.shift()(); // 释放一个槽位
    const release = await pending;
    expect(resolved).toBe(true);
    release();

    releases.forEach((r) => r());
  });

  it("release 只生效一次", async () => {
    const max = queueStats().maxConcurrency;
    const releases = [];
    for (let i = 0; i < max; i++) releases.push(await acquire());
    expect(queueStats().active).toBe(max);
    releases[0]();
    releases[0]();
    expect(queueStats().active).toBe(max - 1);
    releases.slice(1).forEach((r) => r());
  });
});
