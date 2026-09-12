// 极简安全模板渲染器（移植自 resume-workshop，MIT License）。
//
// 约束：
// - 纯字符串、无 DOM 依赖，前端预览与 PDF 导出共用同一份 HTML（所见即所得）。
// - 所有插值默认 HTML 转义；不提供原样输出语法。
// - 仅支持 {{path}}、{{#each list}}…{{/each}}、{{#if value}}…{{/if}}；不执行用户数据里的任何代码。
// - 容错优先：未知路径渲染为空串，标签不配对按文本处理，不抛错。

export type RenderScope = Record<string, unknown>;

type Node =
  | { kind: "text"; text: string }
  | { kind: "value"; path: string }
  | { kind: "each"; path: string; body: Node[] }
  | { kind: "if"; path: string; body: Node[] };

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function resolvePath(scope: RenderScope, path: string): unknown {
  if (path === "this") return scope["this"];
  const segments = path.split(".");
  let current: unknown = scope;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return value !== 0;
  return Boolean(value);
}

export function parseTemplate(template: string): Node[] {
  const root: Node[] = [];
  const stack: Array<{ kind: "each" | "if"; path: string; body: Node[] }> = [];
  const currentBody = (): Node[] => (stack.length > 0 ? stack[stack.length - 1]!.body : root);

  let cursor = 0;
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(template)) !== null) {
    if (match.index > cursor) {
      currentBody().push({ kind: "text", text: template.slice(cursor, match.index) });
    }
    cursor = match.index + match[0].length;

    const inner = match[1] ?? "";
    if (inner.startsWith("#")) {
      const [directive, path] = inner.slice(1).trim().split(/\s+/);
      if ((directive === "each" || directive === "if") && path) {
        const node: Node = { kind: directive, path, body: [] };
        currentBody().push(node);
        stack.push(node as { kind: "each" | "if"; path: string; body: Node[] });
      } else {
        currentBody().push({ kind: "text", text: match[0] });
      }
      continue;
    }
    if (inner.startsWith("/")) {
      const closing = inner.slice(1).trim();
      const top = stack[stack.length - 1];
      if (top && top.kind === closing) stack.pop();
      else currentBody().push({ kind: "text", text: match[0] });
      continue;
    }
    currentBody().push({ kind: "value", path: inner });
  }
  if (cursor < template.length) {
    currentBody().push({ kind: "text", text: template.slice(cursor) });
  }
  return root;
}

function renderNodes(nodes: Node[], scope: RenderScope): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out += node.text;
        break;
      case "value":
        out += escapeHtml(resolvePath(scope, node.path));
        break;
      case "if":
        if (isTruthy(resolvePath(scope, node.path))) out += renderNodes(node.body, scope);
        break;
      case "each": {
        const list = resolvePath(scope, node.path);
        if (!Array.isArray(list)) break;
        for (const item of list) {
          const childScope: RenderScope =
            item !== null && typeof item === "object"
              ? { ...scope, ...(item as Record<string, unknown>), this: item }
              : { ...scope, this: item };
          out += renderNodes(node.body, childScope);
        }
        break;
      }
    }
  }
  return out;
}

// 模板自身可信，仅数据被转义
export function renderTemplate(template: string, scope: RenderScope): string {
  return renderNodes(parseTemplate(template), scope);
}
