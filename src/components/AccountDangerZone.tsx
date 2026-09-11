import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/ui/toast";

// 账号注销（7 天冷静期，期间可撤销）
export default function AccountDangerZone() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pending = user?.pendingDeletion;

  const post = async (url: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "操作失败");
      await refresh();
      return true;
    } catch (err: any) {
      toast(err.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const requestDelete = async () => {
    if (
      !confirm(
        "确定要注销账号吗？账号将在 7 天冷静期后被永久删除（含全部评估记录），期间可随时撤销。"
      )
    )
      return;
    if (await post("/api/account/delete")) toast("已申请注销，7 天内可撤销", "success");
  };

  const cancelDelete = async () => {
    if (await post("/api/account/cancel-delete")) toast("已撤销注销", "success");
  };

  if (!user) return null;

  return (
    <div className="card">
      <h2 className="section-title">
        <span className="section-icon">🛡️</span>
        账号与隐私
      </h2>

      {pending ? (
        <>
          <p className="report">
            你的账号已申请注销，将于 <strong>{pending.purgeAfter}</strong>（UTC）被永久删除。
            到期后账号与全部评估记录将无法恢复；如需继续使用，请立即撤销。
          </p>
          <button className="btn btn-secondary" onClick={cancelDelete} disabled={busy}>
            {busy ? "处理中..." : "撤销注销"}
          </button>
        </>
      ) : (
        <>
          <p className="report">
            注销后，你的账号与全部评估记录将被删除（7 天冷静期，期间可撤销）。
          </p>
          <button className="btn btn-danger" onClick={requestDelete} disabled={busy}>
            {busy ? "处理中..." : "注销账号"}
          </button>
        </>
      )}
    </div>
  );
}
