import { Router } from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

const extractDocx = (buffer) => mammoth.extractRawText({ buffer }).then((r) => r.value);
const extractDoc = (buffer) => new WordExtractor().extract(buffer).then((d) => d.getBody());

router.post("/parse-file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "未收到文件" });
  }

  const { originalname, buffer } = req.file;
  const ext = originalname.split(".").pop()?.toLowerCase();

  try {
    let text = "";

    if (ext === "pdf") {
      text = await extractPdf(buffer);
    } else if (ext === "docx") {
      text = await extractDocx(buffer);
    } else if (ext === "doc") {
      text = await extractDoc(buffer);
    } else if (ext === "txt" || ext === "md") {
      text = buffer.toString("utf-8");
    } else {
      return res.status(400).json({ error: `不支持的文件格式：.${ext}（支持 PDF / DOCX / DOC / TXT / MD）` });
    }

    text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    if (!text) {
      return res.status(400).json({ error: "文件内容为空，或无法提取文字（可能是扫描版 PDF）" });
    }

    res.json({ filename: originalname, text, length: text.length });
  } catch (error) {
    console.error("文件解析失败:", error);
    res.status(500).json({ error: "文件解析失败：" + error.message });
  }
});

export default router;
