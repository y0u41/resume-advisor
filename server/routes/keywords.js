import { Router } from "express";
import { buildLibrary, findCategory } from "../core/keywordLibrary.js";

const router = Router();

// 公开：岗位关键词库（无鉴权）。只暴露聚合后的关键词，不含 JD 原文与任何用户信息。
router.get("/keywords", (req, res) => {
  res.json(buildLibrary());
});

router.get("/keywords/:slug", (req, res) => {
  const cat = findCategory(req.params.slug);
  if (!cat) return res.status(404).json({ error: "分类不存在" });
  res.json(cat);
});

export default router;
