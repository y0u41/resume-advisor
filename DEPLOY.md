# 部署指南（从零上线）

面向：一台 Linux 云服务器（推荐 Ubuntu 22.04+），把本项目部署成公网可访问的网站。

---

## 0. 前置准备

- 一台云服务器（2 核 2G 起，国内/香港均可）
- 一个域名（国内服务器需 **ICP 备案**；香港服务器免备案）
- DeepSeek 或智谱 BigModel 的 API Key

> 想最快上线：买**香港轻量服务器** + 域名，免备案，当天可用。

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
sudo chown -R $USER:$USER /opt/resume-evaluator
cd /opt/resume-evaluator
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

---

## 5. 用 pm2 启动

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # 按提示执行输出的那条命令，实现开机自启

pm2 logs resume-evaluator   # 查看日志，确认「服务器运行在 http://0.0.0.0:3001」
```

此时服务已在本机 `3001` 端口运行，但外部还访问不到。

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

## 9. 升级与维护

```bash
cd /opt/resume-evaluator
git pull
npm ci
npm run build
pm2 restart resume-evaluator
```

**数据库备份**（SQLite 单文件）：
```bash
cp data/app.db ~/backup-$(date +%F).db
# 或定时备份（crontab）
```

---

## 10. 常见问题

| 问题 | 处理 |
|------|------|
| 国内服务器域名打不开 | 域名需完成 **ICP 备案**；未备案只能用 `IP:端口` 访问 |
| 评估很久没响应 | 大模型较慢，可调大 `LLM_TIMEOUT_MS`；或用 `*-flash` 快速模型 |
| 偶发 429 | 免费模型过载，稍等重试；或改用付费模型 |
| 页面能开但接口 401 | 检查 `COOKIE_SECURE=true` 是否与 HTTPS 匹配 |
| 想限制注册 | `.env` 设 `REGISTRATION_OPEN=false` |

---

## 附：本地快速试跑生产模式

```bash
npm run build
npm start          # 访问 http://127.0.0.1:3001
```
