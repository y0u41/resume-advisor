import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTasks } from "../lib/tasks";
import { fetchQuota, type QuotaSnapshot } from "../lib/api";

// 用到 80% 就温和提示一次（把 PRO 的售卖前置到"体验不错但快不够用"的时刻，而不是等报错）
const THRESHOLD = 0.8;

function todayKey() {
  return `quota_warn_dismissed_${new Date().toISOString().slice(0, 10)}`;
}

export default function QuotaBanner() {
  const { user } = useAuth();
  const { tasks } = useTasks();
  const location = useLocation();
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const doneCount = tasks.filter((t) => t.status === "done").length;

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(todayKey()) === "1");
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

  if (!user || !quota || quota.unlimited || quota.limit <= 0) return null;
  if (location.pathname === "/pro") return null;
  if (dismissed) return null;

  const ratio = quota.used / quota.limit;
  if (ratio < THRESHOLD) return null;

  const pct = Math.round(ratio * 100);
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
