import type { DownloadFormat } from "../../lib/report/download";
import type { EvalData } from "./types";
import ScoreBadge from "./ScoreBadge";

interface Props {
  data: EvalData;
  showEditor: boolean;
  onToggleEditor: () => void;
  sharing: boolean;
  onShare: () => void;
  downloadFormat: DownloadFormat;
  setDownloadFormat: (f: DownloadFormat) => void;
  downloading: boolean;
  onDownload: () => void;
  shareHideContact: boolean;
  setShareHideContact: (v: boolean) => void;
  shareHideName: boolean;
  setShareHideName: (v: boolean) => void;
  shareIncludeResume: boolean;
  setShareIncludeResume: (v: boolean) => void;
  shareUrl: string;
  shareExpires: string;
}

export default function ResultActions({
  data,
  showEditor,
  onToggleEditor,
  sharing,
  onShare,
  downloadFormat,
  setDownloadFormat,
  downloading,
  onDownload,
  shareHideContact,
  setShareHideContact,
  shareHideName,
  setShareHideName,
  shareIncludeResume,
  setShareIncludeResume,
  shareUrl,
  shareExpires,
}: Props) {
  return (
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
          {data.scoreDelta != null && (
            <div
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                marginTop: 4,
                color: data.scoreDelta >= 0 ? "var(--success)" : "var(--danger)",
              }}
            >
              较上次 {data.scoreDelta >= 0 ? "+" : ""}
              {data.scoreDelta} 分
              {data.previousScore != null ? `（上次 ${data.previousScore}）` : ""}
            </div>
          )}
        </div>
        <ScoreBadge score={data.score} />
      </div>

      <div className="action-bar">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onToggleEditor}
        >
          {showEditor ? "收起编辑" : "📝 编辑简历"}
        </button>

        <button className="btn btn-secondary btn-sm" onClick={onShare} disabled={sharing || !data.id}>
          {sharing ? "生成中..." : "🔗 分享"}
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
          <button className="btn btn-secondary btn-sm" onClick={onDownload} disabled={downloading}>
            {downloading ? (
              <>
                <span className="spinner spinner-sm" /> 生成中...
              </>
            ) : (
              "⬇️ 下载报告"
            )}
          </button>
        </div>
      </div>

      {shareUrl && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <label className="switch-row" style={{ marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={shareHideContact}
              onChange={(e) => setShareHideContact(e.target.checked)}
            />
            <span>隐藏联系方式（手机号 / 邮箱打码）</span>
          </label>
          <label className="switch-row" style={{ marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={shareHideName}
              onChange={(e) => setShareHideName(e.target.checked)}
            />
            <span>隐藏姓名（保留首字，如「唐**」）</span>
          </label>
          <label className="switch-row" style={{ marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={shareIncludeResume}
              onChange={(e) => setShareIncludeResume(e.target.checked)}
            />
            <span>同时分享简历原文（默认只分享报告）</span>
          </label>
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
            style={{ width: "100%" }}
          />
          <p className="hint" style={{ marginTop: 6 }}>
            任何人可通过此链接查看只读报告（带水印）。
            {shareExpires ? `有效期至 ${shareExpires}（UTC）。` : ""}
            改动勾选后请再点「🔗 分享」重新生成。
          </p>
        </div>
      )}
    </div>
  );
}
