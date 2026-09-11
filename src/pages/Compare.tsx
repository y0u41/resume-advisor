import { useState } from "react";
import { Link } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import Nav from "../components/Nav";
import ModelSelect from "../components/ModelSelect";
import { useModels } from "../lib/ui/models";
import { useToast } from "../lib/ui/toast";
import { useTasks } from "../lib/tasks";
import type { CompareResult } from "../lib/api";

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
  const { startCompare, latestOf } = useTasks();
  const [resume, setResume] = useState("");
  const [jobs, setJobs] = useState<JobRow[]>([
    { title: "", jd: "" },
    { title: "", jd: "" },
  ]);
  const [isStudent, setIsStudent] = useState(false);

  // 后台任务：切换页面后回到本页仍能看到进度/结果
  const task = latestOf("compare");
  const running = task?.status === "running";
  const results: CompareResult[] =
    task?.status === "done" && Array.isArray(task.result) ? task.result : [];

  const setJob = (i: number, key: keyof JobRow, value: string) =>
    setJobs((prev) => prev.map((j, idx) => (idx === i ? { ...j, [key]: value } : j)));

  const addJob = () => {
    if (jobs.length < 4) setJobs((p) => [...p, { title: "", jd: "" }]);
  };
  const removeJob = (i: number) => {
    if (jobs.length > 2) setJobs((p) => p.filter((_, idx) => idx !== i));
  };

  const handleCompare = () => {
    if (!resume.trim()) {
      toast("请先粘贴简历全文", "error");
      return;
    }
    const valid = jobs.filter((j) => j.title.trim());
    if (valid.length < 2) {
      toast("请至少填写 2 个岗位名称", "error");
      return;
    }

    startCompare(
      {
        resume,
        jobs: valid.map((j) => ({ title: j.title.trim(), jd: j.jd.trim() })),
        provider: selection?.provider,
        model: selection?.model,
        candidateType: isStudent ? "student" : "general",
      },
      `${valid.length} 个岗位对比`
    );
  };

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={36} />
          <h1>多岗位对比</h1>
        </div>
        <Nav />
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
          disabled={running}
          onClick={handleCompare}
        >
          {running ? (
            <>
              <span className="spinner" /> {task?.text || "对比中..."}
            </>
          ) : (
            "开始对比"
          )}
        </button>

        {running && <p className="hint">任务在后台运行，切换页面不会中断。</p>}
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
