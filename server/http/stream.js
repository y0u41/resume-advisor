import { acquire } from "../core/queue.js";
import { userMessage } from "./userMessages.js";

// SSE 连接封装：统一响应头、断连检测、安全写出、排队、收尾。
// 多个流式端点的样板收敛到这里，避免"复制漂移"——历史上 interview/directions 的
// 扣费顺序 bug 正是复制漂移的产物。
// onClose：可选，连接关闭时额外回调（如游客路径需要退还额度）。
export function createSseConn(res, onClose) {
  let clientClosed = false;
  res.on("close", () => {
    clientClosed = true;
    if (typeof onClose === "function") onClose();
  });

  const safeWrite = (line) => {
    if (clientClosed || res.writableEnded) return false;
    try {
      res.write(line);
      return true;
    } catch {
      return false;
    }
  };

  return {
    get closed() {
      return clientClosed;
    },
    start() {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    },
    write(obj) {
      safeWrite(`data: ${JSON.stringify(obj)}\n\n`);
    },
    error(message) {
      safeWrite(`data: ${JSON.stringify({ error: message, done: true })}\n\n`);
      if (!res.writableEnded) res.end();
    },
    end() {
      if (!res.writableEnded) res.end();
    },
    // 获取并发槽位；失败时自动发 error 事件并 end，返回 release 或 null
    async queue() {
      try {
        return await acquire((position) =>
          safeWrite(`data: ${JSON.stringify({ queued: true, position })}\n\n`)
        );
      } catch (error) {
        this.error(userMessage(error));
        return null;
      }
    },
  };
}
