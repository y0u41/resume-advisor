import { useState } from "react";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import Nav from "../components/Nav";
import ModelSelect from "../components/ModelSelect";
import { useModels } from "../lib/ui/models";
import { useToast } from "../lib/ui/toast";
import { useTasks } from "../lib/tasks";
import { downloadText, type DownloadFormat } from "../lib/report/download";

export default function Directions() {
  const { groups, selection, setSelection } = useModels();
  const toast = useToast();
  const { startDirections, latestOf } = useTasks();
  const [resume, setResume] = useState("");
  const [isStudent, setIsStudent] = useState(false);
  const [format, setFormat] = useState<DownloadFormat>("pdf");

  const task = latestOf("directions");
  const running = task?.status === "running";
  const text = task?.text || "";

  const handleGenerate = () => {
    if (!resume.trim()) {
      toast("请先粘贴简历全文", "error");
      return;
    }
    startDirections(
      {
        resume,
        provider: selection?.provider,
        model: selection?.model,
        candidateType: isStudent ? "student" : "general",
      },
      "岗位方向推荐"
    );
  };

  const handleDownload = async () => {
    try {
      await downloadText(
        "岗位方向推荐",
        text,
        `岗位方向推荐_${new Date().toISOString().slice(0, 10)}`,
        format
      );
      toast("已开始下载", "success");
    } catch (e: any) {
      toast("下载失败：" + e.message, "error");
    }
  };

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={36} />
          <h1>岗位方向推荐</h1>
        </div>
        <Nav />
        <p>不知道该投什么？根据简历推荐适合你的岗位方向</p>
      </div>

      <div className="card">
        <div className="form-group">
          <label>简历全文 *</label>
          <textarea
            rows={10}
            placeholder="粘贴简历全文，帮你分析适合投哪些岗位..."
            value={resume}
            onChange={(e) => setResume(e.target.value)}
          />
        </div>

        <label className="switch-row">
          <input type="checkbox" checked={isStudent} onChange={(e) => setIsStudent(e.target.checked)} />
          <span>我是应届生 / 暂无工作经历</span>
        </label>

        <ModelSelect groups={groups} value={selection} onChange={setSelection} />

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%", padding: "14px 24px", fontSize: "1rem" }}
          disabled={running}
          onClick={handleGenerate}
        >
          {running ? (
            <>
              <span className="spinner" /> 正在分析...
            </>
          ) : (
            "推荐岗位方向"
          )}
        </button>
      </div>

      {(text || running) && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">🎯</span>
            推荐结果
          </h2>
          {text ? (
            <div className="report">{text}</div>
          ) : (
            <div className="skeleton-lines">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          )}

          {text && !running && (
            <div className="builder-download" style={{ marginTop: 16 }}>
              <select
                className="format-select"
                value={format}
                onChange={(e) => setFormat(e.target.value as DownloadFormat)}
              >
                <option value="pdf">PDF</option>
                <option value="docx">Word</option>
                <option value="txt">TXT</option>
                <option value="md">Markdown</option>
              </select>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleDownload}>
                ⬇️ 下载
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
