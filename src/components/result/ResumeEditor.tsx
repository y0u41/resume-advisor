import { useState } from "react";
import { useNavigate } from "react-router-dom";
import UrlFetch from "../UrlFetch";
import ModelSelect from "../ModelSelect";
import { useTasks } from "../../lib/tasks";
import type { ModelSelection, ProviderGroup } from "../../lib/ui/models";
import type { EvalData } from "./types";

interface Props {
  data: EvalData;
  resume: string;
  setResume: (v: string) => void;
  jobTitle: string;
  setJobTitle: (v: string) => void;
  jobDescription: string;
  setJobDescription: (v: string) => void;
  jobUrl: string;
  setJobUrl: (v: string) => void;
  isStudent: boolean;
  setIsStudent: (v: boolean) => void;
  groups: ProviderGroup[];
  selection: ModelSelection | null;
  setSelection: (s: ModelSelection) => void;
  onSaved: (updated: EvalData) => void;
}

export default function ResumeEditor({
  data,
  resume,
  setResume,
  jobTitle,
  setJobTitle,
  jobDescription,
  setJobDescription,
  jobUrl,
  setJobUrl,
  isStudent,
  setIsStudent,
  groups,
  selection,
  setSelection,
  onSaved,
}: Props) {
  const navigate = useNavigate();
  const { startEvaluate } = useTasks();
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const save = async () => {
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
          revision: data.revision,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setSaveMsg("记录已在别处更新，已为你加载最新版本，请确认后重新编辑");
          const latest = await fetch(`/api/evaluations/${data.id}`)
            .then((r) => r.json())
            .catch(() => null);
          if (latest) onSaved(latest);
          return;
        }
        setSaveMsg(e.error || "保存失败");
        return;
      }
      const updated = await res.json();
      onSaved(updated);
      setSaveMsg("已保存 ✅");
    } catch (err: any) {
      setSaveMsg("保存失败：" + err.message);
    } finally {
      setSaving(false);
    }
  };

  const reevaluate = () => {
    if (!resume.trim() || !jobTitle.trim()) return;
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
      `${jobTitle.trim()}（重评）`
    );
    navigate(`/result/task/${taskId}`);
  };

  return (
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

      <label className="switch-row">
        <input
          type="checkbox"
          checked={isStudent}
          onChange={(e) => setIsStudent(e.target.checked)}
        />
        <span>应届生 / 暂无工作经历</span>
      </label>

      <ModelSelect groups={groups} value={selection} onChange={setSelection} />

      <div className="editor-actions">
        <button className="btn btn-primary" disabled={saving || !resume.trim()} onClick={save}>
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
          disabled={!resume.trim() || !jobTitle.trim()}
          onClick={reevaluate}
        >
          再次评估
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
  );
}
