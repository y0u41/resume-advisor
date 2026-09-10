import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import UrlFetch from "../components/UrlFetch";
import UserBar from "../components/UserBar";
import ModelSelect from "../components/ModelSelect";
import Logo from "../components/Logo";
import { streamEvaluate } from "../lib/api";
import { useModels } from "../lib/models";
import { SAMPLE_RESUME, SAMPLE_JOB_TITLE, SAMPLE_JD } from "../lib/sample";

export default function Home() {
  const [resume, setResume] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [queuePos, setQueuePos] = useState(0);
  const navigate = useNavigate();
  const { groups, selection, setSelection } = useModels();

  const fillSample = () => {
    setResume(SAMPLE_RESUME);
    setJobTitle(SAMPLE_JOB_TITLE);
    setJobDescription(SAMPLE_JD);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resume.trim() || !jobTitle.trim()) return;

    setLoading(true);
    setStreaming(true);
    setStreamText("");
    setQueuePos(0);

    try {
      await streamEvaluate(
        {
          resume,
          jobTitle,
          jobDescription,
          jobUrl,
          provider: selection?.provider,
          model: selection?.model,
        },
        (text) => {
          setQueuePos(0);
          setStreamText(text);
        },
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
        (msg) => alert("评估失败: " + msg),
        (position) => setQueuePos(position)
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
        <div className="brand">
          <Logo size={46} />
          <h1>简历评估助手</h1>
        </div>
        <p>贴简历 + 说岗位 → 得分 + 挑刺 + 改法</p>
        <nav className="nav">
          <Link to="/">评估简历</Link>
          <Link to="/history">历史记录</Link>
          <button type="button" className="nav-btn" onClick={fillSample}>
            ✨ 试用示例
          </button>
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

          <ModelSelect groups={groups} value={selection} onChange={setSelection} />

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
            {queuePos > 0
              ? `排队中，前面还有 ${queuePos} 位，请稍候...`
              : "AI 正在逐条对照 JD 分析，请稍候..."}
          </div>
          <div className="report streaming-cursor">{streamText}</div>
        </div>
      )}
    </div>
  );
}
