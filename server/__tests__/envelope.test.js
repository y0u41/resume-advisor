import { describe, it, expect } from "vitest";
import { statusToCode, ERROR_CODES } from "../http/errors.js";
import { envelope } from "../http/envelope.js";

function mockRes(status = 200) {
  return {
    statusCode: status,
    headersSent: false,
    json(body) {
      this._body = body;
      return this;
    },
  };
}

describe("统一响应信封", () => {
  it("错误码目录：0 为 ok，未知状态回退 9001，401 映射 1002", () => {
    expect(ERROR_CODES[0]).toBe("ok");
    expect(statusToCode(418)).toBe(9001);
    expect(statusToCode(401)).toBe(1002);
  });

  it("成功响应包裹 code/message/requestId，保留原字段", () => {
    const req = { id: "req-1" };
    const res = mockRes(200);
    envelope(req, res, () => {});
    res.json({ user: { id: 1 } });
    expect(res._body).toMatchObject({ code: 0, message: "ok", requestId: "req-1" });
    expect(res._body.user).toEqual({ id: 1 });
  });

  it("失败响应补 code/requestId，保留 error 兼容旧前端", () => {
    const req = { id: "req-2" };
    const res = mockRes(400);
    envelope(req, res, () => {});
    res.json({ error: "参数错误" });
    expect(res._body.code).toBe(1001);
    expect(res._body.error).toBe("参数错误");
    expect(res._body.message).toBe("参数错误");
    expect(res._body.requestId).toBe("req-2");
  });

  it("已包裹的响应不重复处理", () => {
    const req = { id: "req-3" };
    const res = mockRes(200);
    envelope(req, res, () => {});
    res.json({ code: 0, message: "ok", requestId: "req-3", foo: 1 });
    expect(res._body.foo).toBe(1);
  });
});
