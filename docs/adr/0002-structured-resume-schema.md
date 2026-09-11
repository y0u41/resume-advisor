# ADR-0002：结构化简历 Schema（Zod，单一事实来源）

## 背景

简历此前是自由文本，字段无约束、前后端无统一契约，校验散落各处。

## 决策

- 以 `shared/resumeSchema.js`（Zod）作为**单一事实来源**，`shared/resumeSchema.d.ts` 提供类型，前后端共用。
- 结构：`basics / summary / education[] / experience[] / projects[] / skills[]`，字段级长度约束见 `RESUME_LIMITS`。
- **写严**：`parseResumeContent` 严格校验，失败抛错（接口返回 400）。
- **读宽**：`safeParseResumeContent` 失败回退空简历，绝不 500。
- **未知字段丢弃**（Zod strip 语义）。
- `contentToText` 将结构化内容转为纯文本，供 LLM 与关键词匹配使用。
- 前端 `src/lib/resumeSchema.ts` 提供 Builder 扁平表单 ↔ 结构化的桥接与校验。

## 后果

- 优点：契约明确、校验集中、便于未来做结构化编辑器与迁移。
- 代价：新增依赖 `zod`；前后端共享的是 `.js` + `.d.ts`（因服务端为原生 ESM JS、不做 TS 编译）。
- 接口：`POST /api/resume/validate`；`/api/evaluate` 支持可选 `resumeContent`。
