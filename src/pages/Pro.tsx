import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import Nav from "../components/Nav";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/ui/toast";
import { fetchProPlan, fetchProRequest, requestPro, type ProPlan } from "../lib/api";

export default function Pro() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [plan, setPlan] = useState<ProPlan | null>(null);
  const [req, setReq] = useState<{ id: number; status: string } | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchProPlan()
      .then(setPlan)
      .catch(() => {});
    fetchProRequest()
      .then((d) => setReq(d.request))
      .catch(() => {});
  }, [user]);

  const isPro = user?.role === "admin" || user?.plan === "pro";
  const pending = req?.status === "pending";

  const submit = async () => {
    setSubmitting(true);
    try {
      const d = await requestPro(note);
      setReq({ id: d.id, status: "pending" });
      toast(
        d.already ? "你已提交过申请，正在等待开通" : "申请已提交，管理员会尽快为你开通",
        "success"
      );
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const price = plan?.price ?? 9.9;
  const freeDaily = plan?.free.daily ?? 100;
  const proDaily = plan?.pro.daily ?? 500;
  const freePremium = plan?.free.premiumDaily ?? 5;
  const proPremium = plan?.pro.premiumDaily ?? 30;

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={36} />
          <h1>升级 PRO</h1>
        </div>
        <Nav />
        <p>更快的模型、更多的额度——把你的求职冲刺交给 PRO。</p>
      </div>

      <div className="card">
        <h2 className="section-title">
          <span className="section-icon">⭐</span>
          免费 vs PRO
        </h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>能力</th>
              <th>免费</th>
              <th>PRO（¥{price}/月）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>默认模型</td>
              <td>GLM-Flash（免费）</td>
              <td>DeepSeek-V4-Flash（更快更强）</td>
            </tr>
            <tr>
              <td>每日评估</td>
              <td>{freeDaily} 次</td>
              <td>{proDaily} 次</td>
            </tr>
            <tr>
              <td>高级模型（V4-Pro / GLM-4.6 / GLM-5.3）</td>
              <td>尝鲜 {freePremium} 次/天</td>
              <td>{proPremium} 次/天</td>
            </tr>
            <tr>
              <td>图片 / 扫描简历识别</td>
              <td>3 次/天</td>
              <td>不限</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="section-title">
          <span className="section-icon">🚀</span>
          开通 PRO
        </h2>
        {loading ? (
          <div className="loading-overlay">
            <span className="spinner" style={{ color: "var(--primary)" }} />
            加载中...
          </div>
        ) : !user ? (
          <p className="hint">
            请先<button type="button" className="btn-link" onClick={() => navigate("/login")}>登录</button>
            后再申请开通。
          </p>
        ) : isPro ? (
          <p className="hint">你已是不受限的 PRO 账号，所有功能均已解锁。</p>
        ) : pending ? (
          <p className="hint">
            申请已提交（编号 #{req?.id}），管理员会尽快为你开通。开通后刷新即可看到 PRO 徽章。
          </p>
        ) : (
          <>
            <p className="hint" style={{ marginBottom: 10 }}>
              支付通道还在接入中。现在可以留下备注提交申请，管理员确认后会为你开通 PRO（¥{price}/月）。
            </p>
            <div className="form-group">
              <label>备注（可选）</label>
              <textarea
                rows={3}
                placeholder="如：希望用 DeepSeek 模型 / 联系方式 / 使用场景…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting}
              onClick={submit}
            >
              {submitting ? "提交中..." : `申请开通 PRO（¥${price}/月）`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
