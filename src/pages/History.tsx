import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import Nav from "../components/Nav";

interface EvalRecord {
  id: number;
  job_title: string;
  score: number | null;
  person_name: string | null;
  person_key: string | null;
  created_at: string;
}

const MAX_PER_PERSON = 12;

export default function History() {
  const [records, setRecords] = useState<EvalRecord[]>([]);
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
                  <button className="btn btn-danger" onClick={() => handleDelete(r.id)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
