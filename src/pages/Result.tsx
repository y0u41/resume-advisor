import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import UrlFetch from "../components/UrlFetch";
import UserBar from "../components/UserBar";
import ModelSelect from "../components/ModelSelect";
import { streamEvaluate } from "../lib/api";
import { downloadReport, type DownloadFormat } from "../lib/download";
import { useModels } from "../lib/models";
import {
  parseReport,
  parseMatchItems,
  sectionIcon,
  matchRate,
  type MatchStatus,
} from "../lib/report";

interface EvalData {
  id: number;
  resume: string;
  job_title: string;
  job_description: string;
  job_url: string;
  score: number | null;
  report: string;
  created_at: string;
}

const ICONS: Record<MatchStatus, string> = {
  ok: "✅",
  partial: "⚠️",
  miss: "❌",
};

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const cls = score >= 7 ? "score-high" : score >= 4 ? "score-mid" : "score-low";
  return (
    <div className={`score-badge ${cls}`}>
      {score}
      <small>/ 10</small>
    </div>
  );
}

function MatchSection({ content }: { content: string }) {
  const items = parseMatchItems(content);

  if (items.length === 0) {
    return <div className="report">{content}</div>;
  }

  const okCount = items.filter((i) => i.status === "ok").length;
  const partialCount = items.filter((i) => i.status === "partial").length;
  const rate = matchRate(items);

  return (
    <div>
      <div className="match-summary">
        <div className="match-rate">
          <div className="match-rate-label">
            <span>岗位匹配度</span>
            <span>
              {okCount} 项满足 · {partialCount} 项部分 · {items.length - okCount - partialCount} 项缺失
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ ["--target-width" as string]: `${rate}%` }}
            />
          </div>
        </div>
        <div className={`score-badge ${rate >= 70 ? "score-high" : rate >= 40 ? "score-mid" : "score-low"}`}>
          {rate}
          <small>%</small>
        </div>
      </div>

      <div className="match-list">
        {items.map((item, i) => (
          <div
            key={i}
            className={`match-item ${item.status}`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <span className="match-icon">{ICONS[item.status]}</span>
            <div className="match-body">
              <div className="match-req">{item.req}</div>
              <div className="match-detail">{item.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportView({ report }: { report: string }) {
  const sections = parseReport(report);
  if (sections.length === 0) {
    return (
      <div className="card">
        <div className="report">{report}</div>
      </div>
    );
  }
  return (
    <>
      {sections.map((s, i) => (
        <div className="card" key={i}>
          <h2 className="section-title">
            <span className="section-icon">{sectionIcon(s.title)}</span>
            {s.title}
          </h2>
          {s.title.includes("匹配对照") ? (
            <MatchSection content={s.content} />
          ) : (
            <div className="report">{s.content}</div>
          )}
        </div>
      ))}
    </>
  );
}

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
  const [showEditor, setShowEditor] = useState(false);

  const [reLoading, setReLoading] = useState(false);
  const [reText, setReText] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>("pdf");
  const [downloading, setDownloading] = useState(false);
  const { groups, selection, setSelection } = useModels();

  const applyFull = (d: EvalData) => {
    setData(d);
    setResume(d.resume || "");
    setJobTitle(d.job_title || "");
    setJobDescription(d.job_description || "");
    setJobUrl(d.job_url || "");
  };

  useEffect(() => {
    if (stateData?.report) {
      const hasFull = stateData.resume !== undefined;
      const d: EvalData = {
        id: stateData.id ?? (id && id !== "latest" ? Number(id) : 0),
        resume: stateData.resume ?? "",
        job_title: stateData.jobTitle ?? "",
        job_description: stateData.jobDescription ?? "",
        job_url: stateData.jobUrl ?? "",
        score: stateData.score ?? null,
        report: stateData.report,
        created_at: new Date().toISOString(),
      };
      setData(d);
      setResume(d.resume);
      setJobTitle(d.job_title);
      setJobDescription(d.job_description);
      setJobUrl(d.job_url);
      setLoading(false);

      if (!hasFull && id && id !== "latest") {
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

  const handleReevaluate = async () => {
    if (!resume.trim() || !jobTitle.trim()) return;
    setReLoading(true);
    setReText("");
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
        (text) => setReText(text),
        (result) => {
          setData({
            id: result.id ?? data?.id ?? 0,
            resume,
            job_title: jobTitle,
            job_description: jobDescription,
            job_url: jobUrl,
            score: result.score,
            report: result.report,
            created_at: new Date().toISOString(),
          });
        },
        (msg) => alert("再次评估失败: " + msg)
      );
    } catch (err: any) {
      alert("请求失败: " + err.message);
    } finally {
      setReLoading(false);
      setReText("");
    }
  };

  const saveResume = async () => {
    if (!data) return;
    if (!data.id) {
      setSaveMsg("该记录尚未保存，无法保存修改");
      return;
    }
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/evaluations/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume,
          job_title: jobTitle,
          job_description: jobDescription,
          job_url: jobUrl,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setSaveMsg(e.error || "保存失败");
        return;
      }
      const updated = await res.json();
      applyFull(updated);
      setSaveMsg("已保存 ✅");
    } catch (err: any) {
      setSaveMsg("保存失败：" + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await downloadReport(data, downloadFormat);
    } catch (err: any) {
      alert("下载失败：" + err.message);
    } finally {
      setDownloading(false);
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
        <h1>评估报告</h1>
        <nav className="nav">
          <Link to="/" onClick={guardUnsaved}>
            新建评估
          </Link>
          <Link to="/history">历史记录</Link>
        </nav>
      </div>

      <div className="card">
        <div className="score-wrap" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 4 }}>
              应聘岗位
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{data.job_title || "—"}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 6 }}>
              {new Date(data.created_at).toLocaleString("zh-CN")}
            </div>
          </div>
          <ScoreBadge score={reLoading ? null : data.score} />
        </div>

        <div className="action-bar">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSaveMsg("");
              setShowEditor((v) => !v);
            }}
          >
            {showEditor ? "收起编辑" : "📝 编辑简历"}
          </button>

          <div className="download-group">
            <select
              className="format-select"
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value as DownloadFormat)}
              disabled={downloading}
            >
              <option value="pdf">PDF</option>
              <option value="docx">Word</option>
              <option value="txt">TXT</option>
              <option value="md">Markdown</option>
            </select>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <span className="spinner spinner-sm" /> 生成中...
                </>
              ) : (
                "⬇️ 下载报告"
              )}
            </button>
          </div>

          {saveMsg && !showEditor && <span className="save-msg">{saveMsg}</span>}
        </div>
      </div>

      {showEditor && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">📝</span>
            编辑简历
          </h2>

          <div className="form-group">
            <div className="label-row">
              <label>简历全文</label>
              <span className="char-count">{resume.length} 字</span>
            </div>
            <textarea
              className="editor-textarea"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="在这里自由编辑简历内容，空间足够大..."
            />
          </div>

          <div className="form-group">
            <label>应聘岗位</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="应聘岗位"
            />
          </div>

          <div className="form-group">
            <label>岗位要求（JD）</label>
            <UrlFetch
              value={jobUrl}
              onChange={setJobUrl}
              onFetched={(text, url) => {
                setJobDescription(text);
                setJobUrl(url);
              }}
            />
            <textarea
              className="editor-textarea-sm"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="岗位要求（选填）"
            />
          </div>

          <ModelSelect groups={groups} value={selection} onChange={setSelection} />

          <div className="editor-actions">
            <button
              className="btn btn-primary"
              disabled={saving || !resume.trim()}
              onClick={saveResume}
            >
              {saving ? (
                <>
                  <span className="spinner" /> 保存中...
                </>
              ) : (
                "💾 保存"
              )}
            </button>
            <button
              className="btn btn-secondary"
              disabled={reLoading || !resume.trim() || !jobTitle.trim()}
              onClick={handleReevaluate}
            >
              {reLoading ? (
                <>
                  <span className="spinner" /> 评估中...
                </>
              ) : (
                "🔄 再次评估"
              )}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            「保存」更新当前这条记录；「再次评估」用当前内容重跑一遍并生成一条新记录。
          </p>
          {saveMsg && (
            <p className="hint" style={{ marginTop: 10 }}>
              {saveMsg}
            </p>
          )}
        </div>
      )}

      {reLoading ? (
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
            AI 正在再次评估，请稍候...
          </div>
          <div className="report streaming-cursor">{reText}</div>
        </div>
      ) : (
        <ReportView report={data.report} />
      )}

      {!reLoading && (data.job_description || data.job_url) && (
        <div className="card">
          <h3 style={{ marginBottom: 10, fontSize: "0.95rem", color: "var(--text-secondary)" }}>
            原始 JD
          </h3>
          {data.job_url && (
            <a className="jd-link" href={data.job_url} target="_blank" rel="noreferrer">
              🔗 {data.job_url}
            </a>
          )}
          {data.job_description && (
            <div
              style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                marginTop: data.job_url ? 10 : 0,
              }}
            >
              {data.job_description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
