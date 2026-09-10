import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import UrlFetch from "../components/UrlFetch";
import UserBar from "../components/UserBar";
import ModelSelect from "../components/ModelSelect";
import Logo from "../components/Logo";
import { streamEvaluate } from "../lib/api";
import { useModels } from "../lib/models";
import { SAMPLE_RESUME, SAMPLE_JOB_TITLE, SAMPLE_JD } from "../lib/sample";
import { useToast } from "../lib/toast";

export default function Home() {
  const [resume, setResume] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [isStudent, setIsStudent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [queuePos, setQueuePos] = useState(0);
  const [showGuide, setShowGuide] = useState(() => {
    try {
      return localStorage.getItem("hide_guide") !== "1";
    } catch {
      return true;
    }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const { groups, selection, setSelection } = useModels();
  const toast = useToast();

  const dismissGuide = () => {
    setShowGuide(false);
    try {
      localStorage.setItem("hide_guide", "1");
    } catch {
      // 忽略
    }
  };

  useEffect(() => {
    const st = location.state as { resume?: string; jobTitle?: string } | null;
    if (st?.resume) {
      setResume(st.resume);
      if (st.jobTitle) setJobTitle(st.jobTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          candidateType: isStudent ? "student" : "general",
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
              candidateType: isStudent ? "student" : "general",
            },
          });
        },
        (msg) => toast("评估失败：" + msg, "error"),
        (position) => setQueuePos(position)
      );
    } catch (err: any) {
      toast("请求失败：" + err.message, "error");
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
          <Link to="/builder">简历模板</Link>
          <Link to="/compare">多岗位对比</Link>
          <Link to="/interview">模拟面试</Link>
          <Link to="/directions">岗位推荐</Link>
          <Link to="/history">历史记录</Link>
          <button type="button" className="nav-btn" onClick={fillSample}>
            ✨ 试用示例
          </button>
        </nav>
      </div>

      {showGuide && (
        <div className="guide">
          <div className="guide-steps">
            <span className="guide-step">
              <b>1</b> 贴简历
            </span>
            <span className="guide-step">
              <b>2</b> 填岗位 + JD
            </span>
            <span className="guide-step">
              <b>3</b> 开始评估
            </span>
            <span className="guide-step">
              没有简历？先去 <Link to="/builder">简历模板</Link>
            </span>
          </div>
          <button type="button" className="guide-close" onClick={dismissGuide} title="不再提示">
            ✕
          </button>
        </div>
      )}

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

          <label className="switch-row">
            <input
              type="checkbox"
              checked={isStudent}
              onChange={(e) => setIsStudent(e.target.checked)}
            />
            <span>我是应届生 / 暂无工作经历（按应届生标准评估，不因缺经验扣分）</span>
          </label>

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
          {streamText ? (
            <div className="report streaming-cursor">{streamText}</div>
          ) : (
            <div className="skeleton-lines">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
