// 文本归一化：全角→半角、统一小写、折叠空白。
// 匹配与提取都基于归一化后的文本，保证结果确定、可解释。

const FULLWIDTH_RANGE = /[\uFF01-\uFF5E]/g;
const IDEOGRAPHIC_SPACE = /\u3000/g;
const FULLWIDTH_OFFSET = 0xfee0;

export function normalizeText(input) {
  // 先做全角→半角，再统一小写；顺序不能反，否则全角大写字母无法被 lower 化。
  const halfWidth = String(input || "")
    .replace(FULLWIDTH_RANGE, (ch) => String.fromCharCode(ch.charCodeAt(0) - FULLWIDTH_OFFSET))
    .replace(IDEOGRAPHIC_SPACE, " ");

  return halfWidth.toLowerCase().replace(/\s+/g, " ").trim();
}
