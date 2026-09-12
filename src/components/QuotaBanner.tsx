import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTasks } from "../lib/tasks";
import { fetchQuota, type QuotaSnapshot } from "../lib/api";

// 用到预警线（服务端按 QUOTA_WARN_RATIO 下发，默认 80%）就温和提示一次
// （把 PRO 的售卖前置到"体验不错但快不够用"的时刻，而不是等报错）
const FALLBACK_WARN_RATIO = 0.8;
// PRO 剩余天数 ≤ 该值时提醒续费
const PRO_REMIND_DAYS = 7;

function todayKey() {
  return `quota_warn_dismissed_${new Date().toISOString().slice(0, 10)}`;
}
function proExpiryKey() {
  return `pro_expiry_dismissed_${new Date().toISOString().slice(0, 10)}`;
}

export default function QuotaBanner() {
  const { user } = useAuth();
  const { tasks } = useTasks();
  const location = useLocation();
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [proDismissed, setProDismissed] = useState(false);

  const doneCount = tasks.filter((t) => t.status === "done").length;

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(todayKey()) === "1");
      setProDismissed(localStorage.getItem(proExpiryKey()) === "1");
    } catch {
      // 忽略
    }
  }, []);

  // 拉取用量；每次有任务完成（doneCount 变化）后刷新
  useEffect(() => {
    if (!user) {
      setQuota(null);
      return;
    }
    fetchQuota()
      .then(setQuota)
      .catch(() => {});
  }, [user, doneCount]);

  if (!user || !quota) return null;
  if (location.pathname === "/pro") return null;

  // PRO 即将到期：一次性提醒续费（转化续费的低成本手段；daysLeft 由 /api/quota 下发）
  const daysLeft = quota.daysLeft;
  if (
    quota.plan === "pro" &&
    typeof daysLeft === "number" &&
    daysLeft > 0 &&
    daysLeft <= PRO_REMIND_DAYS &&
    !proDismissed
  ) {
    const dismissPro = () => {
      setProDismissed(true);
      try {
        localStorage.setItem(proExpiryKey(), "1");
      } catch {
        // 忽略
      }
    };
    return (
      <div className="quota-banner">
        <span>
          你的 PRO 将于 <strong>{daysLeft}</strong> 天后到期，到期后自动回到免费档。
          <Link to="/pro">去续费</Link>
        </span>
        <button type="button" className="btn-link" onClick={dismissPro}>
          知道了
        </button>
      </div>
    );
  }

  if (quota.unlimited || quota.limit <= 0) return null;
  if (dismissed) return null;

  const warnAt = quota.warnAt ?? Math.ceil(quota.limit * (quota.warnRatio ?? FALLBACK_WARN_RATIO));
  if (quota.used < warnAt) return null;

  const pct = Math.round((quota.used / quota.limit) * 100);
  const remaining = Math.max(0, quota.limit - quota.used);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(todayKey(), "1");
    } catch {
      // 忽略
    }
  };

  return (
    <div className="quota-banner">
      <span>
        今日评估额度已用 <strong>{quota.used}/{quota.limit}</strong>（{pct}%），仅剩{" "}
        <strong>{remaining}</strong> 次。
        {quota.plan === "free" && (
          <>
            {" "}
            <Link to="/pro">升级 PRO</Link> 可提到 {quota.proDaily} 次/天（¥{quota.price}/月）。
          </>
        )}
      </span>
      <button type="button" className="btn-link" onClick={dismiss}>
        知道了
      </button>
    </div>
  );
}
