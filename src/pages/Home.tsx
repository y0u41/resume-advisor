import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import UrlFetch from "../components/UrlFetch";
import UserBar from "../components/UserBar";
import { streamEvaluate } from "../lib/api";

export default function Home() {
  const [resume, setResume] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resume.trim() || !jobTitle.trim()) return;

    setLoading(true);
    setStreaming(true);
    setStreamText("");

    try {
      await streamEvaluate(
        { resume, jobTitle, jobDescription, jobUrl },
        (text) => setStreamText(text),
        (result) => {
          navigate(`/result/${result.id || "latest"}`, {
            state: {
              score: result.score,
              report: result.report,
              resume,
              jobTitle,
              jobDescription,
              jobUrl,
            },
          });
        },
        (msg) => alert("评估失败: " + msg)
      );
    } catch (err: any) {
      alert("请求失败: " + err.message);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <h1>📋 简历评估助手</h1>
        <p>贴简历 + 说岗位 → 得分 + 挑刺 + 改法</p>
        <nav className="nav">
          <Link to="/">评估简历</Link>
          <Link to="/history">历史记录</Link>
        </nav>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="form-group">
            <label>📄 简历全文 *</label>
            <FileUpload onText={setResume} label="上传简历文件" />
            <textarea
              rows={12}
              placeholder="请把简历全文粘贴到这里，或点击上方按钮上传文件（PDF / Word / TXT）..."
              value={resume}
              onChange={(e) => setResume(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>💼 想应聘的岗位 *</label>
            <input
              type="text"
              placeholder="例如：新媒体运营、Java开发工程师"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>📋 岗位要求（JD）（选填）</label>
            <UrlFetch
              value={jobUrl}
              onChange={setJobUrl}
              onFetched={(text, url) => {
                setJobDescription(text);
                setJobUrl(url);
              }}
            />
            <FileUpload onText={setJobDescription} label="上传JD文件" />
            <textarea
              rows={6}
              placeholder="把招聘网站上的岗位要求粘贴到这里，或用链接抓取 / 上传文件，评估会更准哦..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
            <p className="hint">
              💡 贴上 JD 会让评估更精准，不贴也能用，会按该岗位的通用要求评估
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "14px 24px", fontSize: "1rem" }}
            disabled={loading || !resume.trim() || !jobTitle.trim()}
          >
            {loading ? (
              <>
                <span className="spinner" /> 评估中...
              </>
            ) : (
              "开始评估"
            )}
          </button>
        </div>
      </form>

      {streaming && (
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
              color: "var(--primary)",
              fontWeight: 600,
              fontSize: "0.9rem",
            }}
          >
            <span className="spinner" style={{ color: "var(--primary)" }} />
            AI 正在逐条对照 JD 分析，请稍候...
          </div>
          <div className="report streaming-cursor">{streamText}</div>
        </div>
      )}
    </div>
  );
}
