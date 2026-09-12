import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import Nav from "../components/Nav";
import { recordDownload, shareEvaluation, logEvent } from "../lib/api";
import { downloadReport, type DownloadFormat } from "../lib/report/download";
import { useToast } from "../lib/ui/toast";
import { useModels } from "../lib/ui/models";
import { parseReport } from "../lib/report/report";
import type { EvalData } from "../components/result/types";
import ResultActions from "../components/result/ResultActions";
import ResumeEditor from "../components/result/ResumeEditor";
import ReportView from "../components/result/ReportView";
import ObjectiveCard from "../components/result/ObjectiveCard";
import FollowupPanel from "../components/result/FollowupPanel";
import JdCard from "../components/result/JdCard";
import FeedbackCard from "../components/result/FeedbackCard";

export default function Result() {
  const { id } = useParams();
  const location = useLocation();
  const stateData = location.state as any;

  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);

  const [resume, setResume] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [isStudent, setIsStudent] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>("pdf");
  const [downloading, setDownloading] = useState(false);
  const [shareHideContact, setShareHideContact] = useState(false);
  const [shareIncludeResume, setShareIncludeResume] = useState(false);
  const [shareHideName, setShareHideName] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareExpires, setShareExpires] = useState("");
  const [sharing, setSharing] = useState(false);
  const { groups, selection, setSelection } = useModels();
  const toast = useToast();

  const applyFull = (d: EvalData) => {
    setData(d);
    setResume(d.resume || "");
    setJobTitle(d.job_title || "");
    setJobDescription(d.job_description || "");
    setJobUrl(d.job_url || "");
    setIsStudent(d.candidate_type === "student");
  };

  useEffect(() => {
    if (stateData?.report) {
      const d: EvalData = {
        id: stateData.id ?? (id && id !== "latest" ? Number(id) : 0),
        resume: stateData.resume ?? "",
        job_title: stateData.jobTitle ?? "",
        job_description: stateData.jobDescription ?? "",
        job_url: stateData.jobUrl ?? "",
        score: stateData.score ?? null,
        report: stateData.report,
        candidate_type: stateData.candidateType ?? "general",
        created_at: new Date().toISOString(),
        objective: stateData.objective ?? null,
        revision: stateData.revision ?? 1,
      };
      setData(d);
      setResume(d.resume);
      setJobTitle(d.job_title);
      setJobDescription(d.job_description);
      setJobUrl(d.job_url);
      setIsStudent(d.candidate_type === "student");
      setLoading(false);

      // 拉取完整记录以获取客观分 / 改进轨迹等字段
      if (id && id !== "latest") {
        fetch(`/api/evaluations/${id}`)
          .then((r) => r.json())
          .then((full) => applyFull(full))
          .catch(() => {});
      }
      return;
    }

    if (id && id !== "latest") {
      fetch(`/api/evaluations/${id}`)
        .then((r) => r.json())
        .then((d) => {
          applyFull(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [id]);

  // 报告读完埋点：滚动到底部附近记录一次
  useEffect(() => {
    if (!data?.id) return;
    let done = false;
    const onScroll = () => {
      if (done) return;
      const el = document.documentElement;
      if (el.scrollTop + window.innerHeight >= el.scrollHeight - 120) {
        done = true;
        logEvent("report_read", { id: data.id });
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const timer = setTimeout(onScroll, 1500);
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  // ADR-0007 量化触发器：报告解析降级率（解析失败 → 退化为纯文本）。
  // 每次查看报告计一次 report_parse；解析不出任何小节时额外记 report_parse_fallback。
  useEffect(() => {
    if (!data?.id || !data?.report) return;
    const ok = parseReport(data.report).length > 0;
    logEvent("report_parse", { id: data.id, ok });
    if (!ok) logEvent("report_parse_fallback", { id: data.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  const handleDownload = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await downloadReport(data, downloadFormat);
      recordDownload("report", data.job_title || "评估报告", downloadFormat);
      logEvent("download", { id: data.id, format: downloadFormat });
      toast("已开始下载", "success");
    } catch (err: any) {
      toast("下载失败：" + err.message, "error");
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!data?.id) return;
    setSharing(true);
    try {
      const r = await shareEvaluation(data.id, shareHideContact, shareIncludeResume, shareHideName);
      const url = `${window.location.origin}/share/${r.token}`;
      setShareUrl(url);
      setShareExpires(r.expiresAt || "");
      try {
        await navigator.clipboard.writeText(url);
        toast("分享链接已复制到剪贴板", "success");
      } catch {
        toast("已生成分享链接", "success");
      }
    } catch (err: any) {
      toast("生成分享链接失败：" + err.message, "error");
    } finally {
      setSharing(false);
    }
  };

  const dirty =
    !!data &&
    (resume !== (data.resume || "") ||
      jobTitle !== (data.job_title || "") ||
      jobDescription !== (data.job_description || "") ||
      jobUrl !== (data.job_url || ""));

  const guardUnsaved = (e: { preventDefault: () => void }) => {
    if (dirty && !confirm("当前修改尚未保存，确定离开吗？未保存的修改会丢失。")) {
      e.preventDefault();
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading-overlay">
          <span className="spinner" style={{ color: "var(--primary)" }} />
          加载中...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container">
        <div className="card empty">
          <p>未找到评估记录</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={36} />
          <h1>评估报告</h1>
        </div>
        <Nav onNavigate={guardUnsaved} />
      </div>

      <ResultActions
        data={data}
        showEditor={showEditor}
        onToggleEditor={() => setShowEditor((v) => !v)}
        sharing={sharing}
        onShare={handleShare}
        downloadFormat={downloadFormat}
        setDownloadFormat={setDownloadFormat}
        downloading={downloading}
        onDownload={handleDownload}
        shareHideContact={shareHideContact}
        setShareHideContact={setShareHideContact}
        shareHideName={shareHideName}
        setShareHideName={setShareHideName}
        shareIncludeResume={shareIncludeResume}
        setShareIncludeResume={setShareIncludeResume}
        shareUrl={shareUrl}
        shareExpires={shareExpires}
      />

      <ObjectiveCard objective={data.objective} llmScore={data.score} />

      {showEditor && (
        <ResumeEditor
          data={data}
          resume={resume}
          setResume={setResume}
          jobTitle={jobTitle}
          setJobTitle={setJobTitle}
          jobDescription={jobDescription}
          setJobDescription={setJobDescription}
          jobUrl={jobUrl}
          setJobUrl={setJobUrl}
          isStudent={isStudent}
          setIsStudent={setIsStudent}
          groups={groups}
          selection={selection}
          setSelection={setSelection}
          onSaved={applyFull}
        />
      )}

      <ReportView report={data.report} />

      <FollowupPanel
        data={data}
        resume={resume}
        jobTitle={jobTitle}
        jobDescription={jobDescription}
        isStudent={isStudent}
        selection={selection}
      />

      <JdCard jobUrl={data.job_url} jobDescription={data.job_description} />

      <FeedbackCard evalId={data.id} />
    </div>
  );
}
