# 简历评估助手

贴简历 + 说岗位 → AI 给出 0-10 分评分、逐条挑刺、给出改法，并对照 JD 展示岗位匹配度。

## 功能

- **简历评估**：十分制评分、一句话结论、岗位匹配对照、三大优点、问题清单、逐条改法、AI 修改建议、关键词补齐、可继续增强的方向
- **岗位匹配对照**：逐条对照 JD，用 ✅ / ⚠️ / ❌ 标注，并计算匹配度进度条
- **多种录入方式**：直接粘贴、上传文件（PDF / DOCX / DOC / TXT / MD）、粘贴岗位链接自动抓取
- **流式输出**：评估过程实时显示
- **修改与重评**：评估后可直接编辑简历 / 岗位 / JD 并重新评估
- **多格式下载**：PDF / Word / TXT / Markdown
- **历史记录**：按人分组，同一人最多保留 12 次提交

## 技术栈

React 19 + TypeScript + Vite ｜ Express 5 ｜ better-sqlite3 ｜ DeepSeek（OpenAI 兼容接口）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 LLM_API_KEY

# 3. 开发模式（前端 5173 + 后端 3001）
npm run dev
```

浏览器打开 http://localhost:5173

### 生产模式

```bash
npm run build   # 构建前端到 dist/
npm start       # 后端同时服务前端，访问 http://127.0.0.1:3001
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_API_KEY` | （必填） | LLM 接口密钥 |
| `LLM_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容接口地址 |
| `LLM_MODEL` | `deepseek-v4-flash` | 模型名（可用 `deepseek-v4-pro` 提升质量） |
| `LLM_TIMEOUT_MS` | `120000` | LLM 请求超时（毫秒） |
| `PORT` | `3001` | 后端端口 |
| `HOST` | `127.0.0.1` | 监听地址（默认仅本机，安全） |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 允许的跨域来源（逗号分隔） |
| `DB_PATH` | `data/app.db` | SQLite 数据库路径（测试用 `:memory:`） |

## 常用脚本

```bash
npm run dev        # 开发（前后端一起）
npm run build      # 构建前端
npm start          # 生产运行
npm test           # 运行单元测试
npm run typecheck  # TypeScript 类型检查
```

## 安全说明（重要）

1. **API Key**：`.env` 已在 `.gitignore` 中，切勿提交。若密钥曾泄露，请立即到控制台**吊销并重建**。
2. **仅本机访问**：默认只监听 `127.0.0.1`。如需局域网访问，请自行评估风险后设置 `HOST=0.0.0.0` 并配置 `CORS_ORIGINS`。
3. **SSRF 防护**：链接抓取接口会拒绝内网 / 回环 / 链路本地地址，并校验重定向目标。
4. **数据隐私**：`data/` 目录（含简历隐私）已被忽略，不会进入版本库。
5. **速率限制**：评估 / 抓取 / 解析接口有限流，防止 API 额度被刷。

## 已知限制

- 扫描版 PDF（图片型）无法提取文字，需手动粘贴
- 动态渲染或需登录的招聘网页可能抓取不到，需手动复制
- PDF 导出为图片式渲染（文字不可选中），如需可编辑请下载 Word
- 报告结构化依赖模型遵循固定格式，格式偏差时前端会降级为纯文本展示
- "同一个人"以简历首个非空行（通常为姓名）识别，重名会合并

## 目录结构

```
server/           后端
  index.js        服务入口（安全中间件、限流、静态服务）
  db.js           SQLite 初始化与迁移
  store.js        评估保存 + 每人保留 12 条
  person.js       人物标识提取
  llm.js          LLM 调用（超时/取消/校验）
  prompt.js       人设与提示词
  routes/         evaluate / parse / fetch 路由
src/              前端
  pages/          Home / Result / History
  components/     FileUpload / UrlFetch
  lib/            api / download / report
```
