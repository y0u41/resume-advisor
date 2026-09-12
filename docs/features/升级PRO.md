# 升级 PRO

> 支付接入前的人工开通闭环：**用户申请 → 管理员批准即开通**。
> 原则：**任何"升级 / 开通"文案都必须能落到 `/pro`**，不允许出现无法兑现的承诺。

## 背景

之前额度报错文案写着"或升级 PRO"、顶栏有 PRO 徽章、管理员能手动切套餐，
但普通用户**没有任何升级入口**——这句文案是兑现不了的承诺，且 PRO 的卖点只出现在报错这种最差的售卖场景里。

## 入口

- 顶栏 `UserBar`：「升级 PRO」（非管理员且非 PRO 用户可见）。
- 额度报错文案：`server/core/quota.js` 的 `quotaMessage` 指向「升级 PRO」页并带上价格。
- **额度预警条**（把售卖前置到"体验不错但快不够用"的时刻，而不是等报错）：
  `GET /api/quota`（只读快照）+ `src/components/QuotaBanner.tsx`；用量 **≥ 80%** 时在顶部温和提示，
  链到 `/pro`，可**按天 dismiss**（`localStorage`），任务完成数变化后自动刷新；管理员 / PRO 不显示。
- 路由：`/pro`（`src/pages/Pro.tsx`，需登录，`Protected` 包裹）。

## 页面

- **套餐对比**：免费 vs PRO（默认模型 / 每日评估 / 高级模型 / 图片简历 OCR）。
- **价格**：`PRO_PRICE`（默认 ¥9.9/月），由 `GET /api/pro/plan` 提供。
- **支付（支付网关接入前的最简闭环）**：
  - `PRO_PAY_QR`：收款码图片（微信/支付宝）——`<img>` 展示。
  - `PRO_PAY_URL`：外部支付链接（有赞 / 爱发电等），新窗口打开。
  - `PRO_PAY_NOTE`：补充说明。
  - 三者均未配置时，页面提示"可先提交申请，管理员联系收款"。
- **申请**：**付款后填写付款邮箱**（预填账号邮箱）+ 备注 → 提交；已提交显示"等待开通"；已是 PRO / 管理员显示已解锁。

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pro/plan` | 当前套餐 + 价格 + 各档额度 + `planExpiresAt` / `daysLeft` |
| GET | `/api/pro/request` | 我的最近一条申请状态 |
| POST | `/api/pro/request` | 提交申请（同用户仅一条 `pending`，重复返回 `already`） |
| GET | `/api/admin/pro-requests` | 管理员：申请列表（待处理优先） |
| POST | `/api/admin/pro-requests/:id` | 管理员：`action=approve\|reject`；**approve 即写入 `plan='pro'` + 到期时间（未过期则顺延一个月）** |

## 正式配置收款码（让闭环真正转起来）

支付网关接入前，用**个人收款码 + 人工开通**闭环。三步：

1. **准备收款码图片**：微信/支付宝「收款码」保存为 PNG（建议正方形、≤ 500KB）。
2. **放到 `public/`**（Vite 构建时原样拷到 `dist/`，可通过根路径访问）：
   ```
   resume-evaluator/public/pay-qr.png
   ```
   > 该文件已被 `.gitignore` 排除（`public/pay-qr*`），**不会**进入公开仓库。
3. **服务器 `.env` 配置并重启**：
   ```
   PRO_PAY_QR=/pay-qr.png
   PRO_PAY_NOTE=付款后请填写你付款的账号邮箱，管理员核对后开通
   # 或用外部支付链接（爱发电 / 有赞）：
   # PRO_PAY_URL=https://afdian.net/@yourname
   ```
   ```bash
   cd /opt/git/resume-evaluator
   git pull && npm ci && npm run build
   pm2 restart resume-evaluator
   ```

**验证**：登录后打开 `/pro` → 「第 1 步 · 支付 ¥9.9」下方出现收款码，手机扫一扫能打开收款页。
图片 404 时页面会退回"提交申请、管理员联系收款"的兜底文案（不会显示裂图）。

**三种收款方式**（可同时配）：

| 变量 | 用途 |
|------|------|
| `PRO_PAY_QR` | 收款码图片：站内路径 `/pay-qr.png`、外链 URL、或 `data:image/png;base64,...` |
| `PRO_PAY_URL` | 外部支付链接（新窗口打开） |
| `PRO_PAY_NOTE` | 补充说明（转账备注、联系方式等） |

**完整闭环**：用户扫码付款 → 填付款邮箱提交申请 → 管理员后台「PRO 开通申请」点「开通」→ 用户获得 1 个月 PRO
（`plan_expires_at`，到期自动回落免费）。两端都配置好后，**无需改代码**。

## 有效期与自动降级（防止"一次性置位"漏钱）

定价是 **¥9.9/月**，所以 PRO 必须是**按月**的，而不是一置位就永久有效。

- 字段：`users.plan_expires_at`（`NULL` = 永久，仅管理员手动授予用）。
- 判定：`server/core/plans.js` 的 `normalizePlan(user)` 发现 `plan='pro'` 且已过期 → **返回 `free`**。
  额度、默认模型、`/pro` 展示全部走 `normalizePlan`，因此**过期即时生效，不需要定时任务**。
- 懒落库：`getUserFromToken`（`server/core/auth.js`）遇到过期 PRO 会顺手把 `plan` 改回 `free`、清空到期时间（每账号只写一次）。
- 写入：管理员批准申请、或后台「套餐」点 PRO，都按 `PRO_PERIOD_MONTHS`（默认 1）写入；**未过期的 PRO 再次开通 = 顺延**。
- 展示：顶栏 PRO 徽章 tooltip、`/pro` 页「有效期至 …（剩 N 天）」、后台用户表到期日 + 「N 人 7 天内到期」提醒、PRO 申请列表「已开通 · 至 …」。
- 续费：`/pro` 页对已 PRO 用户也展示支付 + 申请表单，提交后管理员批准即顺延。

## 数据

- `pro_requests(id, user_id, pay_email, note, status, created_at, handled_at)`；`status = pending | approved | rejected`。
- 含 `user_id` → 由 `server/jobs/purge.js` 的自动发现纳入注销清理（无需登记）。
- 管理员后台有「PRO 开通申请」卡片（含**付款邮箱**列），可直接「开通 / 驳回」。

## 注意

- 这是**临时**流程；支付接入后改为线上支付 + 自动开通，页面保留。
- 新增任何"升级 / 开通 / 额度"相关文案时，务必确认有对应入口（当前为 `/pro`）。
