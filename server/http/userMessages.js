// 把服务端技术错误翻译成用户能看懂的中文人话。
// 原始 error 仍完整进服务端日志（排障能力不损失）；这里只处理"写给前端"的那一份。
// 规则按顺序匹配，命中即返回；`null` 表示"已是人话，原样透传"。
const RULES = [
  [/超时|timeout/i, "评估超时了，请重试一次"],
  [/ECONNRESET|fetch failed|network|socket|ECONNREFUSED|EAI_AGAIN|ENOTFOUND/i, "网络波动，请稍后重试"],
  [/停滞|stalled/i, "生成中断了，请重试一次"],
  [/429|rate limit|too many requests|繁忙/i, "模型服务繁忙，请一分钟后再试"],
  [/排队人数过多/, null], // 已是人话
];

// 供路由层在把错误写给前端前调用；返回一定是中文人话。
export function userMessage(error) {
  // 额度类（code 3001）的 message 来自 quotaMessage，本就是人话
  if (error?.code === 3001) return error.message;
  const msg = String(error?.message || "").trim();
  if (!msg) return "服务暂时不可用，请稍后重试";
  for (const [re, text] of RULES) {
    if (re.test(msg)) return text ?? msg;
  }
  // 不含英文字母 → 认为已是中文人话（如"评估结果为空，请重试"），原样透传；
  // 含英文（ECONNRESET / fetch failed / LLM API ...）→ 兜底为通用文案，不泄漏技术细节。
  if (!/[A-Za-z]/.test(msg)) return msg;
  return "服务暂时不可用，请稍后重试";
}
