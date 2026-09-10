import { useState } from "react";
import { Link } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import ModelSelect from "../components/ModelSelect";
import { useModels } from "../lib/models";
import { useToast } from "../lib/toast";
import { compareStream, type CompareResult } from "../lib/api";

interface JobRow {
  title: string;
  jd: string;
}

function scoreColor(s: number | null) {
  return s == null ? "var(--text-secondary)" : s >= 7 ? "#10b981" : s >= 4 ? "#f59e0b" : "#ef4444";
}

export default function Compare() {
  const { groups, selection, setSelection } = useModels();
  const toast = useToast();
  const [resume, setResume] = useState("");
  const [jobs, setJobs] = useState<JobRow[]>([
    { title: "", jd: "" },
    { title: "", jd: "" },
  ]);
  const [isStudent, setIsStudent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [queuePos, setQueuePos] = useState(0);
  const [results, setResults] = useState<CompareResult[]>([]);

  const setJob = (i: number, key: keyof JobRow, value: string) =>
    setJobs((prev) => prev.map((j, idx) => (idx === i ? { ...j, [key]: value } : j)));

  const addJob = () => {
    if (jobs.length < 4) setJobs((p) => [...p, { title: "", jd: "" }]);
  };
  const removeJob = (i: number) => {
    if (jobs.length > 2) setJobs((p) => p.filter((_, idx) => idx !== i));
  };

  const handleCompare = async () => {
    if (!resume.trim()) {
      toast("请先粘贴简历全文", "error");
      return;
    }
    const valid = jobs.filter((j) => j.title.trim());
    if (valid.length < 2) {
      toast("请至少填写 2 个岗位名称", "error");
      return;
    }

    setLoading(true);
    setResults([]);
    setProgress("");
    setQueuePos(0);
    try {
      await compareStream(
        {
          resume,
          jobs: valid.map((j) => ({ title: j.title.trim(), jd: j.jd.trim() })),
          provider: selection?.provider,
          model: selection?.model,
          candidateType: isStudent ? "student" : "general",
        },
        {
          onProgress: (p) => {
            setQueuePos(0);
            setProgress(`正在评估 ${p.index + 1}/${p.total}：${p.title}`);
          },
          onDone: (r) => {
            setResults(r);
            setProgress("");
            toast(`对比完成，共 ${r.length} 个岗位`, "success");
          },
          onError: (m) => toast("对比失败：" + m, "error"),
          onQueued: (pos) => setQueuePos(pos),
        }
      );
    } catch (e: any) {
      toast("请求失败：" + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={36} />
          <h1>多岗位对比</h1>
        </div>
        <nav className="nav">
          <Link to="/">评估简历</Link>
          <Link to="/builder">简历模板</Link>
          <Link to="/compare">多岗位对比</Link>
          <Link to="/interview">模拟面试</Link>
          <Link to="/directions">岗位推荐</Link>
          <Link to="/history">历史记录</Link>
        </nav>
        <p>一份简历同时对比多个岗位，看看哪个更匹配、更值得投</p>
      </div>

      <div className="card">
        <div className="form-group">
          <label>简历全文 *</label>
          <textarea
            rows={8}
            placeholder="粘贴简历全文..."
            value={resume}
            onChange={(e) => setResume(e.target.value)}
          />
        </div>

        <label className="switch-row">
          <input type="checkbox" checked={isStudent} onChange={(e) => setIsStudent(e.target.checked)} />
          <span>我是应届生 / 暂无工作经历（按应届生标准评估）</span>
        </label>

        <ModelSelect groups={groups} value={selection} onChange={setSelection} />
      </div>

      <div className="card">
        <div className="compare-jobs-head">
          <label>对比岗位（2 ~ 4 个）</label>
          {jobs.length < 4 && (
            <button type="button" className="btn-link" onClick={addJob}>
              + 添加岗位
            </button>
          )}
        </div>

        {jobs.map((job, i) => (
          <div className="compare-job" key={i}>
            <div className="compare-job-top">
              <input
                type="text"
                placeholder={`岗位 ${i + 1} 名称，如：Java 开发工程师`}
                value={job.title}
                onChange={(e) => setJob(i, "title", e.target.value)}
              />
              {jobs.length > 2 && (
                <button type="button" className="btn-danger btn" onClick={() => removeJob(i)}>
                  删除
                </button>
              )}
            </div>
            <textarea
              rows={3}
              placeholder="该岗位的 JD（选填，贴上更准）"
              value={job.jd}
              onChange={(e) => setJob(i, "jd", e.target.value)}
            />
          </div>
        ))}

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%", padding: "14px 24px", fontSize: "1rem", marginTop: 8 }}
          disabled={loading}
          onClick={handleCompare}
        >
          {loading ? (
            <>
              <span className="spinner" /> {queuePos > 0 ? `排队中，前面还有 ${queuePos} 位` : progress || "对比中..."}
            </>
          ) : (
            "开始对比"
          )}
        </button>
      </div>

      {results.length > 0 && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">📊</span>
            对比结果（按评分排序）
          </h2>
          <div className="compare-table-wrap">
            <table className="admin-table compare-table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>岗位</th>
                  <th>评分</th>
                  <th>匹配度</th>
                  <th>一句话结论</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.id}>
                    <td className="compare-rank">{i + 1}</td>
                    <td>{r.title}</td>
                    <td style={{ color: scoreColor(r.score), fontWeight: 700, whiteSpace: "nowrap" }}>
                      {r.score ?? "—"}/10
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.matchRate != null ? `${r.matchRate}%` : "—"}</td>
                    <td className="compare-conclusion">{r.conclusion}</td>
                    <td>
                      <Link to={`/result/${r.id}`} className="btn-link">
                        查看报告
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
