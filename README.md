# 简历评估助手

贴简历 + 说岗位 → AI 给出 0-10 分评分、逐条挑刺、给出改法，并对照 JD 展示岗位匹配度。

## 功能

- **简历评估**：十分制评分、一句话结论、岗位匹配对照、三大优点、问题清单、逐条改法、AI 修改建议、关键词补齐、可继续增强的方向
- **岗位匹配对照**：逐条对照 JD，用 ✅ / ⚠️ / ❌ 标注，并计算匹配度进度条
- **多种录入方式**：直接粘贴、上传文件（PDF / DOCX / DOC / TXT / MD）、粘贴岗位链接**智能提取**岗位重点信息（岗位职责、任职要求、薪资待遇等，自动过滤导航/广告/推荐等噪声）
- **流式输出**：评估过程实时显示
- **修改与重评**：评估后可直接编辑简历 / 岗位 / JD 并重新评估
- **多格式下载**：PDF / Word / TXT / Markdown
- **历史记录**：按人分组，同一人最多保留 12 次提交
- **多用户**：邮箱注册 / 登录，数据按用户隔离，每人每日额度限制
- **管理员**：可用用户名登录，拥有用户管理页（查看用户、用量）

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
| `LLM_PROVIDER` | `deepseek` | 当前使用的提供商：`deepseek` 或 `bigmodel` |
| `DEEPSEEK_API_KEY` | — | DeepSeek 密钥 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek 接口地址 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | DeepSeek 模型 |
| `BIGMODEL_API_KEY` | — | 智谱 BigModel 密钥 |
| `BIGMODEL_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | BigModel 接口地址 |
| `BIGMODEL_MODEL` | `glm-4.7-flash` | BigModel 模型 |
| `LLM_TIMEOUT_MS` | `120000` | LLM 请求超时（毫秒） |
| `LLM_STREAM_IDLE_MS` | `45000` | 流式响应无数据的停滞超时（毫秒），超时自动回退非流式 |
| `JD_EXTRACT` | `true` | 链接抓取后是否用 LLM 智能提取岗位重点信息（`false` 则返回清洗后的原文） |
| `PORT` | `3001` | 后端端口 |
| `HOST` | `127.0.0.1` | 监听地址（默认仅本机，安全） |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 允许的跨域来源（逗号分隔） |
| `DB_PATH` | `data/app.db` | SQLite 数据库路径（测试用 `:memory:`） |
| `AUTH_SECRET` | （生产必填） | 登录令牌签名密钥，随机长字符串；不设则每次重启失效 |
| `AUTH_TOKEN_TTL` | `7d` | 登录态有效期 |
| `COOKIE_SECURE` | `false` | Cookie 是否仅走 HTTPS（对外部署启用 HTTPS 后设为 `true`） |
| `DAILY_LIMIT` | `30` | 每人每日评估次数上限 |
| `REGISTRATION_OPEN` | `true` | 是否开放注册（`false` 则关闭注册入口） |

## 切换模型提供商

支持任意 OpenAI 兼容服务。内置 DeepSeek 与智谱 BigModel，切换只需改 `LLM_PROVIDER`：

```env
# 用 DeepSeek
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxx

# 或用智谱 BigModel
LLM_PROVIDER=bigmodel
BIGMODEL_API_KEY=xxx
BIGMODEL_MODEL=glm-4.7-flash
```

**智谱 BigModel**（[文档](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction)）
- 接口地址：`https://open.bigmodel.cn/api/paas/v4`
- 模型：`glm-5.3`（旗舰）、`glm-4.6`、`glm-4.7-flash`（免费）、`glm-4.5-flash`（免费）
- ⚠️ 其 `temperature` 区间为 (0,1)，不支持 0（本项目已适配）

**接入其它服务**：设 `LLM_PROVIDER=<名字>`，再配置 `<名字>_API_KEY` / `<名字>_BASE_URL` / `<名字>_MODEL`（前缀大写）。

## 常用脚本

```bash
npm run dev        # 开发（前后端一起）
npm run build      # 构建前端
npm start          # 生产运行
npm test           # 运行单元测试
npm run typecheck  # TypeScript 类型检查
npm run create-admin -- <用户名> <密码>   # 创建/重置管理员账号
```

## 管理员账号

管理员用**用户名**登录（普通用户用邮箱注册）。创建或重置：

```bash
npm run create-admin -- yu yourpassword
```

- 登录入口支持「邮箱 / 账号」，管理员填用户名即可
- 登录后顶栏出现「用户管理」，可查看所有用户及当日用量
- 管理员同样受每日额度限制

## 安全说明（重要）

1. **API Key**：`.env` 已在 `.gitignore` 中，切勿提交。若密钥曾泄露，请立即到控制台**吊销并重建**。
2. **仅本机访问**：默认只监听 `127.0.0.1`。对外部署时设置 `HOST=0.0.0.0`，务必配合**反向代理 + HTTPS**，并设置 `COOKIE_SECURE=true`、`AUTH_SECRET`、`CORS_ORIGINS`。
3. **鉴权**：除注册/登录外，所有接口都要求登录；数据按 `user_id` 严格隔离；登录接口有独立限流防暴力破解。
4. **SSRF 防护**：链接抓取接口会拒绝内网 / 回环 / 链路本地地址，并校验重定向目标。
5. **数据隐私**：`data/` 目录（含简历隐私）已被忽略，不会进入版本库。
6. **速率限制**：评估 / 抓取 / 解析接口有限流，另有每人每日额度，防止 API 额度被刷。
7. **首个注册用户**会继承升级前遗留的本地历史数据。

## 已知限制

- 扫描版 PDF（图片型）无法提取文字，需手动粘贴
- 动态渲染（SPA）或需登录的招聘网页，服务器拿不到正文，会回退为原始文本或提示手动复制
- 链接提取会额外调用一次 LLM 做信息抽取；可设置 `JD_EXTRACT=false` 关闭，关闭后返回清洗过的网页原文
- PDF 导出为图片式渲染（文字不可选中），如需可编辑请下载 Word
- 报告结构化依赖模型遵循固定格式，格式偏差时前端会降级为纯文本展示
- "同一个人"以简历首个非空行（通常为姓名）识别，重名会合并

## 目录结构

```
server/           后端
  index.js        服务入口（安全中间件、限流、静态服务）
  db.js           SQLite 初始化与迁移（users / evaluations / usage_log）
  auth.js         密码加密、JWT、登录中间件
  quota.js        每人每日额度
  store.js        评估保存 + 每人保留 12 条
  person.js       人物标识提取
  llm.js          LLM 调用（超时/取消/校验）
  prompt.js       人设与提示词
  routes/         auth / evaluate / parse / fetch 路由
src/              前端
  pages/          Login / Home / Result / History
  components/     FileUpload / UrlFetch / UserBar
  lib/            auth / api / download / report
```
