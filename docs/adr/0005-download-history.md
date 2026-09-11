# ADR-0005：记录下载/导出历史

## 背景

下载在浏览器端生成（jspdf / html2canvas / docx），服务端无感知，用户也无法回看导出记录。

## 决策

- 新增 `downloads` 表（`user_id / kind / title / format / created_at`）。
- `POST /api/downloads` 记录一次导出；`GET /api/downloads` 返回最近 100 条。
- 前端在生成文件成功后调用 `recordDownload(...)`（失败不影响下载本身）。
- 历史页新增「下载记录」卡片展示。

## 后果

- 优点：可回看、可统计、实现简单。
- 代价：记录由客户端上报，属「尽力而为」，极端情况下可能漏记；不涉及版本恢复（与 resume-workshop 的取舍一致）。
