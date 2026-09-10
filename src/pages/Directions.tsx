import { useState } from "react";
import { Link } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import ModelSelect from "../components/ModelSelect";
import { useModels } from "../lib/models";
import { useToast } from "../lib/toast";
import { directionsStream } from "../lib/api";
import { downloadText, type DownloadFormat } from "../lib/download";

export default function Directions() {
  const { groups, selection, setSelection } = useModels();
  const toast = useToast();
  const [resume, setResume] = useState("");
  const [isStudent, setIsStudent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queuePos, setQueuePos] = useState(0);
  const [text, setText] = useState("");
  const [format, setFormat] = useState<DownloadFormat>("pdf");

  const handleGenerate = async () => {
    if (!resume.trim()) {
      toast("请先粘贴简历全文", "error");
      return;
    }
    setLoading(true);
    setText("");
    setQueuePos(0);
    try {
      await directionsStream(
        {
          resume,
          provider: selection?.provider,
          model: selection?.model,
          candidateType: isStudent ? "student" : "general",
        },
        (t) => {
          setQueuePos(0);
          setText(t);
        },
        () => toast("岗位方向推荐已生成", "success"),
        (m) => toast("生成失败：" + m, "error"),
        (pos) => setQueuePos(pos)
      );
    } catch (e: any) {
      toast("请求失败：" + e.message, "error");
    } finally {
      setLoading(false);
    }
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
        <nav className="nav">
          <Link to="/">评估简历</Link>
          <Link to="/builder">简历模板</Link>
          <Link to="/compare">多岗位对比</Link>
          <Link to="/interview">模拟面试</Link>
          <Link to="/history">历史记录</Link>
        </nav>
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
          disabled={loading}
          onClick={handleGenerate}
        >
          {loading ? (
            <>
              <span className="spinner" /> {queuePos > 0 ? `排队中，前面还有 ${queuePos} 位` : "正在分析..."}
            </>
          ) : (
            "推荐岗位方向"
          )}
        </button>
      </div>

      {(text || loading) && (
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

          {text && !loading && (
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
