# 部署指南（从零上线）

面向：一台 Linux 云服务器（推荐 Ubuntu 22.04+），把本项目部署成公网可访问的网站。

---

## 0. 前置准备

- 一台云服务器（2 核 2G 起，国内/香港均可）
- 一个域名（国内服务器需 **ICP 备案**；香港服务器免备案）
- DeepSeek 或智谱 BigModel 的 API Key

> 想最快上线：买**香港轻量服务器** + 域名，免备案，当天可用。

## 0.1 安全前置（重要）

简历属**敏感个人信息**，对外提供前**务必启用 HTTPS**：

- **国内服务器**：域名需完成 **ICP 备案**（约 1–3 周），备案后按第 6 节用 Caddy 自动签发证书。
- **香港 / 海外服务器**：**免备案**，当天可上 HTTPS。
- 启用 HTTPS 后，`.env` 设 **`COOKIE_SECURE=true`**（否则 Cookie 可能被降级传输）；`HOST=0.0.0.0`、`CORS_ORIGINS` 填你的域名。
- 服务启动时若 `NODE_ENV=production` 且 `COOKIE_SECURE≠true`，会打印安全告警。

---

## 1. 服务器初始化（Ubuntu）

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pm2（进程守护）与构建工具
sudo npm install -g pm2
sudo apt install -y git build-essential

node -v && npm -v
```

> `better-sqlite3` 需要编译，故安装 `build-essential`。

---

## 2. 获取代码

```bash
sudo mkdir -p /opt && cd /opt
sudo git clone <你的仓库地址> resume-evaluator
sudo chown -R $USER:$USER /opt/git/resume-evaluator
cd /opt/git/resume-evaluator
```

---

## 3. 配置环境变量

```bash
cp .env.example .env
nano .env
```

**生产环境必须修改：**

```env
# 用哪个提供商
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxx

# 对外监听
HOST=0.0.0.0
CORS_ORIGINS=https://your-domain.com

# 鉴权：生成随机长串（openssl rand -hex 32）
AUTH_SECRET=换成随机长字符串
COOKIE_SECURE=true

# 额度与并发
DAILY_LIMIT=30
MAX_CONCURRENCY=5
MAX_QUEUE=50
```

生成随机密钥：
```bash
openssl rand -hex 32
```

---

## 4. 安装依赖并构建

```bash
npm ci
npm run build
```

> **部署一律用 `npm ci`**（严格按 `package-lock.json` 安装，可复现、不升级依赖），不要用 `npm install`（会按 `^` 范围拉新版本，可能引入未测过的变更）。

---

## 5. 用 pm2 启动

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # 按提示执行输出的那条命令，实现开机自启

pm2 logs resume-evaluator   # 查看日志，确认「服务器运行在 http://0.0.0.0:3001」
```

此时服务已在本机 `3001` 端口运行，但外部还访问不到。

> **优雅停机**：`ecosystem.config.cjs` 已设 `kill_timeout: 40000`。`pm2 reload` / `restart` 时服务会**停止接收新请求**、等待进行中的评估跑完落库（最多 35s）再退出；无进行中任务时约 1 秒内退出。若手动改过 pm2 配置，请确保 `kill_timeout` 不小于 40s，否则 pm2 会提前 SIGKILL。

> ⚠️ **pm2 是按用户隔离的**：如果用 `sudo` / `sudo -i` 启动过，进程属于 **root 的 pm2**（`/root/.pm2`）；之后用普通用户执行 `pm2 restart` 会报 `Process or Namespace ... not found`。请用**启动它的同一用户**重启，例如 `sudo -i pm2 restart resume-evaluator`。可用 `pm2 list` 与 `ps -ef | grep pm2` 确认进程归属。

---

## 6. 反向代理 + HTTPS（Caddy）

Caddy 会自动申请并续期免费 HTTPS 证书。

```bash
# 安装 Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# 使用项目里的 Caddyfile（把 your-domain.com 改成你的域名）
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile      # 修改域名
sudo systemctl reload caddy
```

**域名解析**：到域名服务商处添加一条 A 记录，指向服务器公网 IP。

> ⚠️ **反代部署必须在 `.env` 设 `TRUST_PROXY=1`**。Caddy 反代后若不信任代理，`req.ip` 会全是 `127.0.0.1`，导致**游客限流与速率限制全局串味**（第二个游客当天即被判定"试用次数已用完"）。`deploy/Caddyfile` 已用 `header_up X-Forwarded-For {client_ip}` 传递真实客户端 IP。
> 项目**默认为 `0`（直连，不信任任何 `X-Forwarded-For`）**。当前 3001 端口直连部署务必保持 0，否则客户端可伪造 `X-Forwarded-For` 绕过游客限流、无限刷试用，使转化数据失真。

---

## 7. 开放端口

云服务器**安全组**放行：`80`、`443`（Caddy 需要）。`3001` **不要**对外暴露。

```bash
sudo ufw allow 80,443/tcp
sudo ufw enable
```

---

## 8. 验证

浏览器打开 `https://your-domain.com`：
1. 出现登录页 → 注册第一个账号（**会继承服务器上遗留的本地数据**）
2. 创建管理员：`npm run create-admin -- yu 你的强密码`
3. 用管理员登录，顶栏出现「用户管理」

---

## 8.1 SEO：岗位关键词库（配好域名后再做）

1. `.env` 设 `SITE_URL=https://your-domain.com`（canonical / sitemap 用绝对地址），重启。
2. 确认 `https://your-domain.com/robots.txt` 允许 `/keywords`、`/sitemap.xml` 可访问。
3. 到搜索资源平台提交 sitemap：
   - **Google Search Console** → 站点 → Sitemaps → 提交 `https://your-domain.com/sitemap.xml`
   - **Bing Webmaster Tools** → 同上
   - **百度搜索资源平台** → 普通收录 → sitemap → 提交
4. **冷启动提示**：关键词库设了发布门槛（分类 ≥ `KEYWORDS_MIN_JD`(5) 份 JD、全站 ≥ `KEYWORDS_MIN_TOTAL_JD`(20) 份 JD）。
   未达标的页面是 `noindex` 且**不进 sitemap**——数据够之前**不必急着提交**，等页面自动"解锁"（`/keywords` 与分类页变 `index`）后再提交。

---

## 8.2 配置 PRO 收款码（让付费闭环能转）

> 收款码是**个人支付图片**，已被 `.gitignore` 排除（`public/pay-qr*`）——**不会进公开仓库，也不会随 `git pull` 到服务器**，必须手动上传一次。

1. 把微信/支付宝收款码保存为本地 `resume-evaluator/public/pay-qr.png`。
2. 上传到服务器（在**本地**执行；把 `<user>` 换成你的登录用户，如 `root` / `ubuntu`）：
   ```bash
   scp "E:\git\resume-evaluator\public\pay-qr.png" <user>@119.27.181.86:/opt/git/resume-evaluator/public/pay-qr.png
   ```
3. 服务器 `.env` 加：
   ```
   PRO_PAY_QR=/pay-qr.png
   PRO_PAY_NOTE=付款后请填写你付款的账号邮箱，管理员核对后开通
   ```
   > 不想放图也可用外部支付链接：`PRO_PAY_URL=https://afdian.net/@yourname`。
4. 构建 + 重启（`build` 会把 `public/` 拷进 `dist/`）：
   ```bash
   cd /opt/git/resume-evaluator && npm run build && pm2 restart resume-evaluator
   ```
5. 验证：手机浏览器打开 `http://119.27.181.86:3001/pro` → 「第 1 步 · 支付 ¥9.9」下方出现收款码，扫码能打开收款页。
   图片 404 时会退回"提交申请、管理员联系收款"的兜底文案。

> **不要在生产目录跑 `git clean -fdx`**——会删掉未跟踪文件，包括这张收款码。
> 完整闭环见 `docs/features/升级PRO.md`。

---

## 9. 升级与维护

```bash
cd /opt/git/resume-evaluator
git pull
npm ci
npm run build
pm2 restart resume-evaluator
```

> **`git pull` 卡住怎么办？** 部分国内网络到 GitHub 的 **git 传输**不稳定（但 HTTPS 正常）。可改用 GitHub 压缩包覆盖（用仓库实际的 owner/repo 替换）：
>
> ```bash
> cd /tmp && rm -rf repo.tar.gz repo-master && \
> curl -fL --max-time 120 "https://codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/master" -o repo.tar.gz && \
> tar xzf repo.tar.gz && \
> cp -rf /tmp/repo-master/<子目录>/. /opt/git/resume-evaluator/ && \
> rm -rf /tmp/repo-master repo.tar.gz
> ```
>
> 压缩包**不含** `.env` / `data/` / `node_modules`，不会覆盖你的配置与数据库。
> 完成后同样执行 `npm ci && npm run build && pm2 restart resume-evaluator`。

### 9.1 ⚠️ 从旧版本升级：数据库路径变了（不迁移会「数据消失」）

- **旧版本**（`server/db.js` 时期）：库在 **`data/app.db`**（`__dirname = server`，`../data/app.db`）。
- **当前版本**（`server/core/db.js`）：库在 **`server/data/app.db`**（`__dirname = server/core`，`../data/app.db`）。

路径变了，**文件不会自己搬**。若直接 `git pull` + 重启，新代码会在 `server/data/app.db` **新建一个空库**，看起来「所有用户和历史都没了」——其实数据还完好地躺在 `data/app.db` 里。

**迁移（旧库 → 新路径，只需做一次）：**

```bash
cd /opt/git/resume-evaluator
sudo pm2 stop resume-evaluator                 # ① 先停服，保证 WAL 一致

mkdir -p ~/re-backups
cp -a data/app.db data/app.db-wal data/app.db-shm ~/re-backups/   # ② 先备份

mkdir -p server/data
cp -a data/app.db data/app.db-wal data/app.db-shm server/data/    # ③ 搬到新路径（-wal/-shm 一起搬，SQLite 打开时自动恢复）

sudo pm2 start resume-evaluator                # ④ 启动时自动跑 user_version 迁移（旧库 0 → 最新）
```

**验证**（`sqlite3` 未安装时用 node 版）：

```bash
sqlite3 server/data/app.db "PRAGMA user_version; SELECT COUNT(*) FROM users;"
# 或用项目自带的 better-sqlite3：
node -e "const D=require('better-sqlite3');const db=new D('server/data/app.db');console.log('user_version',db.pragma('user_version',{simple:true}),'users',db.prepare('SELECT COUNT(*) c FROM users').get().c);db.close()"
```

`user_version` 应等于最新迁移号（当前 **13**），且用户/评估条数与旧库一致。

> **必须停服再 `cp`**：运行中的 WAL 直接复制可能得到不一致状态。
> 迁移后 `data/app.db` 可保留作历史兜底——新服务只读写 `server/data/app.db`（见 9.2 说明）。

### 9.2 数据库备份与恢复

> 库文件路径见 **9.1**：当前版本是 `server/data/app.db`（旧版是 `data/app.db`）。

服务**内置每日自动备份**：启动时 + 每 24 小时，用 better-sqlite3 在线备份到 `backups/app-YYYY-MM-DD.db`（保留最近 7 份，可用 `BACKUP_DIR` / `BACKUP_KEEP` 调整），**无需停服**。

```bash
# 实时库在 server/data/app.db（db.js: path.join(__dirname,"..","data","app.db")，__dirname = server/core）
# 手动补一份（可选；内置备份已覆盖）
cp server/data/app.db ~/backup-$(date +%F).db
# 若还残留旧路径 data/app.db，一并备份（存在才备，不存在不报错）
[ -f data/app.db ] && cp data/app.db ~/backup-legacy-$(date +%F).db || true
# 备份目录权限收紧（含用户简历，敏感）
chmod 700 backups
```

**恢复**：停服 → 用备份覆盖实时库 → 清 WAL → 重启。
```bash
pm2 stop resume-evaluator
cp backups/app-2026-09-12.db server/data/app.db
rm -f server/data/app.db-wal server/data/app.db-shm
pm2 start resume-evaluator
```

> 两个库文件可以共存（独立的 SQLite 文件），但**只有 `server/data/app.db` 是服务实际读写的库**；`data/app.db` 仅作历史兜底（从旧版本升级时的迁移见 **9.1**）。
> `backups/` 已在 `.gitignore`，切勿提交。

---

## 10. 常见问题

| 问题 | 处理 |
|------|------|
| 国内服务器域名打不开 | 域名需完成 **ICP 备案**；未备案只能用 `IP:端口` 访问 |
| `git pull` 长时间卡住 | 到 GitHub 的 git 传输不稳，改用 `codeload.github.com` 压缩包覆盖（见第 9 节） |
| `pm2 restart` 报 `Process or Namespace ... not found` | pm2 按用户隔离，用启动它的同一用户重启：`sudo -i pm2 restart resume-evaluator`（见第 5 节） |
| 评估很久没响应 | 大模型较慢，可调大 `LLM_TIMEOUT_MS`；或用 `*-flash` 快速模型 |
| 偶发 429 | 免费模型过载，稍等重试；或改用付费模型 |
| 升级后「用户/历史都不见了」 | 数据库路径变了（旧 `data/app.db` → 新 `server/data/app.db`），按 **9.1** 迁移即可恢复 |
| 页面能开但接口 401 | 检查 `COOKIE_SECURE=true` 是否与 HTTPS 匹配 |
| 想限制注册 | `.env` 设 `REGISTRATION_OPEN=false` |

---

## 附：本地快速试跑生产模式

```bash
npm run build
npm start          # 访问 http://127.0.0.1:3001
```
