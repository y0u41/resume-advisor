import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Logo from "../components/Logo";
import ReportView from "../components/result/ReportView";
import { fetchShared } from "../lib/api";

export default function ShareView() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("分享不存在");
      setLoading(false);
      return;
    }
    fetchShared(token)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="container">
        <div className="loading-overlay">
          <span className="spinner" style={{ color: "var(--primary)" }} />
          加载中...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container">
        <div className="card empty">
          <p>{error || "分享不存在或已取消"}</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
            去简历参谋
          </Link>
        </div>
      </div>
    );
  }

  const scoreCls =
    data.score == null ? "" : data.score >= 7 ? "score-high" : data.score >= 4 ? "score-mid" : "score-low";

  return (
    <div className="container share-page">
      <div className="share-watermark">
        简历参谋 · 由 {data.person_name || "用户"} 分享
      </div>

      <div className="header">
        <div className="brand">
          <Logo size={40} />
          <h1>简历参谋 · 分享报告</h1>
        </div>
        <p>由「简历参谋」生成的简历评估报告（只读）</p>
      </div>

      <div className="card">
        <div className="score-wrap" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>应聘岗位</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{data.job_title || "—"}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 6 }}>
              {new Date(data.created_at).toLocaleString("zh-CN")}
              {data.hideContact ? " · 已隐藏联系方式" : ""}
            </div>
          </div>
          {data.score != null && (
            <div className={`score-badge ${scoreCls}`}>
              {data.score}
              <small>/ 10</small>
            </div>
          )}
        </div>
      </div>

      <ReportView report={data.report || ""} />

      <div className="card" style={{ textAlign: "center" }}>
        <p className="hint">想给自己的简历也来一份这样的报告？</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 8 }}>
          免费试用简历参谋
        </Link>
      </div>
    </div>
  );
}
