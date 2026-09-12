import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import Nav from "../components/Nav";
import AccountDangerZone from "../components/AccountDangerZone";

interface EvalRecord {
  id: number;
  job_title: string;
  score: number | null;
  person_name: string | null;
  person_key: string | null;
  favorite?: number;
  created_at: string;
}

interface DownloadRecord {
  id: number;
  kind: string;
  title: string;
  format: string;
  created_at: string;
}

const MAX_PER_PERSON = 12;

export default function History() {
  const [records, setRecords] = useState<EvalRecord[]>([]);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/evaluations")
      .then((r) => r.json())
      .then((d) => {
        setRecords(d.records || []);
        setUsage(d.usage || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/downloads")
      .then((r) => r.json())
      .then((d) => setDownloads(d.downloads || []))
      .catch(() => {});
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: EvalRecord[] }>();
    for (const r of records) {
      const key = r.person_key || "__none__";
      if (!map.has(key)) map.set(key, { name: r.person_name || "未命名", items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.values());
  }, [records]);

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除这条记录？")) return;
    await fetch(`/api/evaluations/${id}`, { method: "DELETE" });
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleFavorite = async (r: EvalRecord) => {
    const next = r.favorite ? 0 : 1;
    const res = await fetch(`/api/evaluations/${r.id}/favorite`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: next }),
    });
    if (!res.ok) return;
    setRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, favorite: next } : x)));
  };

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={36} />
          <h1>历史记录</h1>
        </div>
        <Nav />
        {usage && (
          <p className="usage-hint">
            今日已用 {usage.used} / {usage.limit} 次
          </p>
        )}
      </div>

      {loading ? (
        <div className="card">
          <div className="loading-overlay">
            <span className="spinner" style={{ color: "var(--primary)" }} />
            加载中...
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="card empty">
          <p>暂无评估记录</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
            去评估简历
          </Link>
        </div>
      ) : (
        groups.map((g, gi) => (
          <div className="card person-group" key={gi}>
            <div className="person-header">
              <span className="person-avatar">{g.name.slice(0, 1)}</span>
              <span className="person-name">{g.name}</span>
              <span className="person-count">
                共 {g.items.length} 次 · 最多保留 {MAX_PER_PERSON} 次
              </span>
            </div>

            <div className="person-records">
              {g.items.map((r, i) => (
                <div key={r.id} className="history-item">
                  <div>
                    <Link to={`/result/${r.id}`}>{r.job_title}</Link>
                    <div className="meta">
                      <span className="record-index">第 {g.items.length - i} 次</span>
                      {new Date(r.created_at).toLocaleString("zh-CN")}
                      {r.score !== null && (
                        <span
                          className="record-score"
                          style={{
                            color:
                              r.score >= 7 ? "#10b981" : r.score >= 4 ? "#f59e0b" : "#ef4444",
                          }}
                        >
                          {r.score}/10
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flex: "none" }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => toggleFavorite(r)}
                      title={r.favorite ? "取消收藏" : "收藏（收藏的记录不会被自动清理）"}
                    >
                      {r.favorite ? "★ 已收藏" : "☆ 收藏"}
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(r.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {downloads.length > 0 && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">⬇️</span>
            下载记录
          </h2>
          <div className="person-records">
            {downloads.map((d) => (
              <div key={d.id} className="history-item">
                <div>
                  <span>{d.title || (d.kind === "resume" ? "简历" : "评估报告")}</span>
                  <div className="meta">
                    <span className="record-index">{d.kind === "resume" ? "简历" : "报告"}</span>
                    {String(d.format || "").toUpperCase()}
                    {new Date(d.created_at).toLocaleString("zh-CN")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AccountDangerZone />
    </div>
  );
}
