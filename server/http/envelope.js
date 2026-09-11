import crypto from "crypto";
import { statusToCode } from "./errors.js";

// 为每个请求生成 requestId，回显到响应头 X-Request-Id，并挂到 req.id 供日志使用。
export function requestId(req, res, next) {
  const id = req.headers["x-request-id"] || crypto.randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
}

// 统一响应信封（渐进式、向后兼容）。
//
// 成功：{ code: 0, message: "ok", requestId, ...原字段 }
// 失败：{ code, message, requestId, error: <message>, ...原字段 }
//
// - 保留原有字段（含 error），因此旧前端无需改动即可继续工作。
// - 仅包裹 JSON 对象；SSE 流式响应走 res.write，不受影响。
// - 接口可在 body 里显式带 code 覆盖默认映射（例如 2002 邮箱已注册）。
export function envelope(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.headersSent || !req.id) return originalJson(body);

    if (body && typeof body === "object" && !Array.isArray(body) && !Buffer.isBuffer(body)) {
      // 已包裹过则不重复处理
      if (body.code === 0 && body.requestId) return originalJson(body);

      const status = res.statusCode;
      if (status >= 400) {
        const message = body.error || body.message || "请求失败";
        return originalJson({
          code: body.code ?? statusToCode(status),
          message,
          requestId: req.id,
          ...body,
          error: body.error || message,
        });
      }
      return originalJson({ code: 0, message: "ok", requestId: req.id, ...body });
    }

    return originalJson(body);
  };

  next();
}
