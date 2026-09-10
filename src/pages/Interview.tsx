import { useState } from "react";
import { Link } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import ModelSelect from "../components/ModelSelect";
import { useModels } from "../lib/models";
import { useToast } from "../lib/toast";
import { interviewStream } from "../lib/api";
import { downloadText, type DownloadFormat } from "../lib/download";

export default function Interview() {
  const { groups, selection, setSelection } = useModels();
  const toast = useToast();
  const [resume, setResume] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isStudent, setIsStudent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queuePos, setQueuePos] = useState(0);
  const [text, setText] = useState("");
  const [format, setFormat] = useState<DownloadFormat>("pdf");

  const handleGenerate = async () => {
    if (!resume.trim() || !jobTitle.trim()) {
      toast("请填写简历和应聘岗位", "error");
      return;
    }
    setLoading(true);
    setText("");
    setQueuePos(0);
    try {
      await interviewStream(
        {
          resume,
          jobTitle,
          jobDescription,
          provider: selection?.provider,
          model: selection?.model,
          candidateType: isStudent ? "student" : "general",
        },
        (t) => {
          setQueuePos(0);
          setText(t);
        },
        () => toast("面试准备已生成", "success"),
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
        "面试准备",
        text,
        `面试准备_${jobTitle || "岗位"}_${new Date().toISOString().slice(0, 10)}`,
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
          <h1>模拟面试</h1>
        </div>
        <nav className="nav">
          <Link to="/">评估简历</Link>
          <Link to="/builder">简历模板</Link>
          <Link to="/compare">多岗位对比</Link>
          <Link to="/history">历史记录</Link>
        </nav>
        <p>根据你的简历和目标岗位，生成面试题、回答思路与自我介绍</p>
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

        <div className="form-group">
          <label>应聘岗位 *</label>
          <input
            type="text"
            placeholder="例如：Java 开发工程师"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>岗位要求（JD）（选填）</label>
          <textarea
            rows={4}
            placeholder="贴上 JD，面试题会更贴合岗位"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
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
              <span className="spinner" /> {queuePos > 0 ? `排队中，前面还有 ${queuePos} 位` : "正在准备面试..."}
            </>
          ) : (
            "生成面试准备"
          )}
        </button>
      </div>

      {(text || loading) && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">🎤</span>
            面试准备
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
                ⬇️ 下载面试准备
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
