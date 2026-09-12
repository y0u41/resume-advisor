import { describe, it, expect } from "vitest";
import { userMessage } from "../http/userMessages.js";

describe("userMessage：技术错误 → 中文人话", () => {
  it("超时类", () => {
    expect(userMessage(new Error("LLM 请求超时"))).toBe("评估超时了，请重试一次");
    expect(userMessage(new Error("request timeout"))).toBe("评估超时了，请重试一次");
  });

  it("网络类", () => {
    expect(userMessage(new Error("fetch failed"))).toBe("网络波动，请稍后重试");
    expect(userMessage(new Error("read ECONNRESET"))).toBe("网络波动，请稍后重试");
    expect(userMessage(new Error("connect ECONNREFUSED"))).toBe("网络波动，请稍后重试");
  });

  it("生成停滞类", () => {
    expect(userMessage(new Error("流式停滞"))).toBe("生成中断了，请重试一次");
  });

  it("429 / 繁忙类", () => {
    expect(userMessage(new Error("LLM API 调用失败 (429): rate limit"))).toBe(
      "模型服务繁忙，请一分钟后再试"
    );
  });

  it("已是中文人话的错误原样透传", () => {
    expect(userMessage(new Error("评估结果为空，请重试"))).toBe("评估结果为空，请重试");
    expect(userMessage(new Error("排队人数过多"))).toBe("排队人数过多");
  });

  it("额度类 code=3001 原样透传", () => {
    const error = new Error("今日评估次数已用完（100/100），可改用标准模型，或升级 PRO");
    error.code = 3001;
    expect(userMessage(error)).toBe("今日评估次数已用完（100/100），可改用标准模型，或升级 PRO");
  });

  it("未知技术错误 → 兜底文案", () => {
    expect(userMessage(new Error("Unexpected token < in JSON at position 0"))).toBe(
      "服务暂时不可用，请稍后重试"
    );
    expect(userMessage(new Error(""))).toBe("服务暂时不可用，请稍后重试");
    expect(userMessage(null)).toBe("服务暂时不可用，请稍后重试");
  });
});
