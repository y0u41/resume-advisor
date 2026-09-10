import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import Nav from "../components/Nav";
import {
  EMPTY_RESUME,
  SAMPLE_RESUME,
  buildResume,
  resumeToHtml,
  STYLE_LABELS,
  LAYOUT_LABELS,
  type ResumeData,
  type ResumeStyle,
  type ResumeLayout,
} from "../lib/resumeTemplate";
import { downloadResume, type DownloadFormat } from "../lib/download";
import { useToast } from "../lib/toast";

const SHORT_FIELDS: { key: keyof ResumeData; label: string; placeholder: string }[] = [
  { key: "name", label: "姓名", placeholder: "刘星宇" },
  { key: "phone", label: "手机", placeholder: "138-0000-0000" },
  { key: "email", label: "邮箱", placeholder: "you@example.com" },
  { key: "city", label: "城市", placeholder: "武汉" },
  { key: "intention", label: "求职意向", placeholder: "Java 后端开发工程师" },
];

const AREA_FIELDS: { key: keyof ResumeData; label: string; placeholder: string; rows: number }[] = [
  {
    key: "education",
    label: "教育背景",
    placeholder: "学校 ｜ 专业 ｜ 学历 ｜ 起止时间\n主修课程：...",
    rows: 3,
  },
  {
    key: "projects",
    label: "项目经历",
    placeholder: "项目名称 ｜ 角色 ｜ 起止时间\n- 做了什么（用到了什么技术）\n- 结果 / 数据",
    rows: 5,
  },
  {
    key: "experience",
    label: "实习 / 工作经历",
    placeholder: "公司 ｜ 岗位 ｜ 起止时间\n- ...",
    rows: 4,
  },
  {
    key: "campus",
    label: "校园经历",
    placeholder: "社团 / 组织 ｜ 角色 ｜ 起止时间\n- ...",
    rows: 3,
  },
  { key: "skills", label: "技能特长", placeholder: "Java、Spring Boot、MySQL、Redis...", rows: 2 },
  { key: "summary", label: "自我评价", placeholder: "一句话概括你的优势与求职动机", rows: 2 },
];

const STYLES: ResumeStyle[] = ["student", "classic", "project"];
const LAYOUTS: ResumeLayout[] = ["single", "sidebar"];
const DRAFT_KEY = "resume_builder_draft";
const VERSIONS_KEY = "resume_builder_versions";

interface Draft {
  data: ResumeData;
  style: ResumeStyle;
  layout: ResumeLayout;
}

interface Version {
  id: number;
  name: string;
  data: ResumeData;
  style: ResumeStyle;
  layout: ResumeLayout;
  savedAt: string;
}

function loadVersions(): Version[] {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      data: { ...EMPTY_RESUME, ...(parsed.data || {}) },
      style: STYLES.includes(parsed.style) ? parsed.style : "student",
      layout: LAYOUTS.includes(parsed.layout) ? parsed.layout : "single",
    };
  } catch {
    return null;
  }
}

export default function Builder() {
  const navigate = useNavigate();
  const initialDraft = useRef<Draft | null>(loadDraft());
  const [data, setData] = useState<ResumeData>(initialDraft.current?.data || EMPTY_RESUME);
  const [style, setStyle] = useState<ResumeStyle>(initialDraft.current?.style || "student");
  const [layout, setLayout] = useState<ResumeLayout>(initialDraft.current?.layout || "single");
  const [format, setFormat] = useState<DownloadFormat>("pdf");
  const [downloading, setDownloading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, style, layout }));
    } catch {
      // 忽略写入失败（隐私模式等）
    }
  }, [data, style, layout]);

  const [versions, setVersions] = useState<Version[]>(loadVersions);
  const [versionName, setVersionName] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
    } catch {
      // 忽略
    }
  }, [versions]);

  const saveVersion = () => {
    const name = versionName.trim() || `版本 ${versions.length + 1}`;
    const v: Version = {
      id: Date.now(),
      name,
      data,
      style,
      layout,
      savedAt: new Date().toISOString(),
    };
    setVersions((prev) => [v, ...prev].slice(0, 20));
    setVersionName("");
    toast(`已保存版本「${name}」`, "success");
  };

  const loadVersion = (v: Version) => {
    setData({ ...EMPTY_RESUME, ...v.data });
    setStyle(v.style);
    setLayout(v.layout);
    toast(`已载入「${v.name}」`, "success");
  };

  const deleteVersion = (id: number) => {
    setVersions((prev) => prev.filter((v) => v.id !== id));
  };

  const text = buildResume(data, style);
  const html = resumeToHtml(data, style, layout);
  const canDownload = data.name.trim().length > 0 || text.replace(/^姓名\s*$/m, "").trim().length > 0;

  const set = (key: keyof ResumeData, value: string) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件", "error");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast("图片过大，请选择 2MB 以内的图片", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("photo", String(reader.result || ""));
    reader.readAsDataURL(file);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadResume(text, html, data.name.trim(), format);
      toast("已开始下载", "success");
    } catch (err: any) {
      toast("下载失败：" + err.message, "error");
    } finally {
      setDownloading(false);
    }
  };

  const goEvaluate = () => {
    navigate("/", { state: { resume: text, jobTitle: data.intention.trim() } });
  };

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={36} />
          <h1>简历模板</h1>
        </div>
        <Nav />
        <p>没有简历？按模板填写内容，自动排版、可下载、还能直接去评估</p>
      </div>

      <div className="builder">
        <div className="builder-form card">
          <div className="builder-toolbar">
            <span className="builder-toolbar-label">视觉模板</span>
            <div className="chips">
              {LAYOUTS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`chip ${layout === l ? "chip-active" : ""}`}
                  onClick={() => setLayout(l)}
                >
                  {LAYOUT_LABELS[l]}
                </button>
              ))}
            </div>
          </div>

          <div className="builder-toolbar">
            <span className="builder-toolbar-label">内容顺序</span>
            <div className="chips">
              {STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip ${style === s ? "chip-active" : ""}`}
                  onClick={() => setStyle(s)}
                >
                  {STYLE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="photo-row">
            <div className="photo-preview">
              {data.photo ? (
                <img src={data.photo} alt="照片" />
              ) : (
                <span className="photo-placeholder">照片</span>
              )}
            </div>
            <div className="photo-actions">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handlePhoto}
              />
              <div className="photo-buttons">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => photoInputRef.current?.click()}
                >
                  📷 {data.photo ? "更换照片" : "上传照片"}
                </button>
                {data.photo && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => set("photo", "")}
                  >
                    移除
                  </button>
                )}
              </div>
              <span className="file-hint">可选：证件照 / 头像，JPG / PNG，≤ 2MB</span>
            </div>
          </div>

          <div className="builder-grid">
            {SHORT_FIELDS.map((f) => (
              <div className="form-group" key={f.key}>
                <label>{f.label}</label>
                <input
                  type="text"
                  placeholder={f.placeholder}
                  value={data[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          {AREA_FIELDS.map((f) => (
            <div className="form-group" key={f.key}>
              <label>{f.label}</label>
              <textarea
                rows={f.rows}
                placeholder={f.placeholder}
                value={data[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </div>
          ))}

          <div className="builder-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setData(SAMPLE_RESUME)}>
              ✨ 填入示例
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setData(EMPTY_RESUME)}>
              清空
            </button>
          </div>

          <div className="versions">
            <label>我的简历版本</label>
            <div className="versions-save">
              <input
                type="text"
                placeholder="版本名称，如：Java岗版"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveVersion();
                }}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={saveVersion}>
                保存为新版本
              </button>
            </div>

            {versions.length > 0 ? (
              <ul className="versions-list">
                {versions.map((v) => (
                  <li key={v.id}>
                    <button type="button" className="btn-link" onClick={() => loadVersion(v)}>
                      {v.name}
                    </button>
                    <span className="versions-meta">
                      {new Date(v.savedAt).toLocaleDateString("zh-CN")}
                    </span>
                    <button
                      type="button"
                      className="btn-link versions-del"
                      onClick={() => deleteVersion(v.id)}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">把简历按不同岗位存成多个版本，投递时切换即可。</p>
            )}
          </div>
        </div>

        <div className="builder-preview">
          <div className="builder-preview-head">
            <span>实时预览</span>
          </div>
          <div className="card builder-paper">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>

          <div className="builder-download">
            <select
              className="format-select"
              value={format}
              onChange={(e) => setFormat(e.target.value as DownloadFormat)}
              disabled={downloading}
            >
              <option value="pdf">PDF</option>
              <option value="docx">Word</option>
              <option value="txt">TXT</option>
              <option value="md">Markdown</option>
            </select>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={downloading || !canDownload}
              onClick={handleDownload}
            >
              {downloading ? (
                <>
                  <span className="spinner spinner-sm" /> 生成中...
                </>
              ) : (
                "⬇️ 下载简历"
              )}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canDownload}
              onClick={goEvaluate}
            >
              用这份简历去评估 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
