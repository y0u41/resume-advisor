// PDF 文本「阅读顺序重建」
//
// 背景：设计型简历 PDF（用 HTML/CSS 打印导出）常用 z-index / position / transform /
// flex 排版，导致 PDF 文字层的**绘制顺序 ≠ 视觉顺序**（例如小节标题被画到文末）。
// 直接按文字层顺序读取会得到「乱序文本」，进而让评估/匹配失真。
//
// 方案：用 pdfjs 取到每个文字块的坐标 (x, y) 与宽度，按「先分行、再按 x 排序」重建
// 视觉阅读顺序，并依据横向间距补空格。适用于绝大多数单栏 / 双栏简历。

function clusterIntoLines(records) {
  // 按 y 从大到小（PDF 坐标 y 向上）；同一行内按 x 从小到大
  records.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let current = null;
  for (const r of records) {
    const tol = Math.max(2.5, r.h * 0.6);
    if (current && Math.abs(r.y - current.y) <= tol) {
      current.items.push(r);
    } else {
      current = { y: r.y, items: [r] };
      lines.push(current);
    }
  }
  return lines;
}

function joinLine(items) {
  items.sort((a, b) => a.x - b.x);
  let text = "";
  let prev = null;
  for (const r of items) {
    if (prev) {
      const gap = r.x - (prev.x + prev.w);
      const fontSize = Math.max(prev.h, r.h, 1);
      // 明显横向间隙 → 补一个空格（列间、字段间）
      if (gap > fontSize * 0.5) text += " ";
    }
    text += r.str;
    prev = r;
  }
  return text.replace(/[ \t\u00a0]+/g, " ").trim();
}

// 将一页的 textContent.items 重建为按阅读顺序排列的文本行
export function reconstructPageText(items) {
  const records = [];
  for (const it of items || []) {
    const str = it?.str;
    if (!str || !str.trim()) continue;
    const transform = it.transform || [1, 0, 0, 1, 0, 0];
    records.push({
      str,
      x: transform[4],
      y: transform[5],
      w: typeof it.width === "number" ? it.width : 0,
      h: it.height || Math.abs(transform[3]) || 10,
    });
  }
  if (records.length === 0) return "";

  return clusterIntoLines(records)
    .map((line) => joinLine(line.items))
    .filter(Boolean)
    .join("\n");
}

// 从 PDF Buffer 提取「按视觉阅读顺序」的文本（延迟加载 pdfjs，避免启动开销）
export async function extractPdfTextOrdered(buffer) {
  // Node 20 兼容保险：pdfjs-dist 依赖 Promise.withResolvers（Node 22+ 原生）
  if (typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function () {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  try {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(reconstructPageText(content.items));
      page.cleanup();
    }
    return pages.join("\n\n").trim();
  } finally {
    await doc.destroy();
  }
}
