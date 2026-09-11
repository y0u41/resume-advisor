import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import UrlFetch from "../components/UrlFetch";
import UserBar from "../components/UserBar";
import ModelSelect from "../components/ModelSelect";
import Logo from "../components/Logo";
import Nav from "../components/Nav";
import { useTasks } from "../lib/tasks";
import { useModels } from "../lib/ui/models";
import { SAMPLE_RESUME, SAMPLE_JOB_TITLE, SAMPLE_JD } from "../lib/resume/sample";
import { useToast } from "../lib/ui/toast";

export default function Home() {
  const [resume, setResume] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [isStudent, setIsStudent] = useState(false);
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
  const { startEvaluate } = useTasks();

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resume.trim() || !jobTitle.trim()) return;

    // 交给后台任务管理器：切换页面也不中断
    const taskId = startEvaluate(
      {
        resume,
        jobTitle,
        jobDescription,
        jobUrl,
        provider: selection?.provider,
        model: selection?.model,
        candidateType: isStudent ? "student" : "general",
      },
      jobTitle.trim()
    );
    navigate(`/result/task/${taskId}`);
  };

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={46} />
          <h1>简历参谋</h1>
        </div>
        <p>贴简历 + 说岗位 → 得分 + 挑刺 + 改法</p>
        <Nav>
          <button type="button" className="nav-btn" onClick={fillSample}>
            试用示例
          </button>
        </Nav>
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
            <label>简历全文 *</label>
            <FileUpload onText={setResume} label="上传简历文件" />
            <textarea
              rows={12}
              placeholder="请把简历全文粘贴到这里，或点击上方按钮上传文件（PDF / Word / TXT）..."
              value={resume}
              onChange={(e) => setResume(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>想应聘的岗位 *</label>
            <input
              type="text"
              placeholder="例如：新媒体运营、Java开发工程师"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>岗位要求（JD）（选填）</label>
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
            disabled={!resume.trim() || !jobTitle.trim()}
          >
            开始评估
          </button>
        </div>
      </form>
    </div>
  );
}
