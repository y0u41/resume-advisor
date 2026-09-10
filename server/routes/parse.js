import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../auth.js";
import { ocrImage } from "../llm.js";
import { getVisionOverride } from "../models.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];
const IMAGE_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bmp: "image/bmp",
  gif: "image/gif",
};
const MAX_OCR_PAGES = 5;

// 这些库含原生或较重的依赖，改为「用到时才加载」，避免启动时崩溃。
async function extractPdfText(buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

// 图片型（扫描版）PDF：渲染成图片后交给视觉模型 OCR
async function ocrPdf(buffer, signal) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const shot = await parser.getScreenshot({ scale: 1.6 });
    const pages = (shot.pages || []).slice(0, MAX_OCR_PAGES);
    const texts = [];
    for (const page of pages) {
      const dataUrl = `data:image/png;base64,${Buffer.from(page.data).toString("base64")}`;
      texts.push(await ocrImage(dataUrl, signal, getVisionOverride()));
    }
    return texts.join("\n\n");
  } finally {
    await parser.destroy();
  }
}

async function ocrImageBuffer(buffer, mime, signal) {
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  return await ocrImage(dataUrl, signal, getVisionOverride());
}

async function extractDocx(buffer) {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractDoc(buffer) {
  const WordExtractor = (await import("word-extractor")).default;
  const doc = await new WordExtractor().extract(buffer);
  return doc.getBody();
}

router.post("/parse-file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "未收到文件" });
  }

  const { originalname, buffer, mimetype } = req.file;
  const ext = originalname.split(".").pop()?.toLowerCase();

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort(new Error("客户端已断开"));
  });

  try {
    let text = "";
    let usedOcr = false;

    if (ext === "pdf") {
      text = await extractPdfText(buffer);
      // 文字太少 → 判定为图片型 PDF，走 OCR
      if (text.replace(/\s/g, "").length < 20) {
        if (!getVisionOverride()) {
          return res.status(422).json({
            error: "这是图片型（扫描版）PDF，需要视觉模型才能识别，但当前未配置（如 glm-5.3-flash / deepseek-v4-flash-vision-exp）",
          });
        }
        text = await ocrPdf(buffer, controller.signal);
        usedOcr = true;
      }
    } else if (ext === "docx") {
      text = await extractDocx(buffer);
    } else if (ext === "doc") {
      text = await extractDoc(buffer);
    } else if (ext === "txt" || ext === "md") {
      text = buffer.toString("utf-8");
    } else if (IMAGE_EXTS.includes(ext)) {
      if (!getVisionOverride()) {
        return res.status(422).json({
          error: "图片识别需要视觉模型，但当前未配置（如 glm-5.3-flash / deepseek-v4-flash-vision-exp）",
        });
      }
      text = await ocrImageBuffer(buffer, mimetype || IMAGE_MIME[ext], controller.signal);
      usedOcr = true;
    } else {
      return res.status(400).json({
        error: `不支持的文件格式：.${ext}（支持 PDF / DOCX / DOC / 图片 / TXT / MD）`,
      });
    }

    text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    if (!text) {
      return res.status(400).json({ error: "无法提取文字，请确认文件内容或手动粘贴" });
    }

    res.json({ filename: originalname, text, length: text.length, ocr: usedOcr });
  } catch (error) {
    console.error("文件解析失败:", error);
    res.status(500).json({ error: "文件解析失败：" + error.message });
  }
});

export default router;
