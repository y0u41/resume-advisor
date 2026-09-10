import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import {
  EMPTY_RESUME,
  SAMPLE_RESUME,
  buildResume,
  resumeToHtml,
  STYLE_LABELS,
  type ResumeData,
  type ResumeStyle,
} from "../lib/resumeTemplate";
import { downloadResume, type DownloadFormat } from "../lib/download";

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

export default function Builder() {
  const navigate = useNavigate();
  const [data, setData] = useState<ResumeData>(EMPTY_RESUME);
  const [style, setStyle] = useState<ResumeStyle>("student");
  const [format, setFormat] = useState<DownloadFormat>("pdf");
  const [downloading, setDownloading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const text = buildResume(data, style);
  const html = resumeToHtml(data, style);
  const canDownload = data.name.trim().length > 0 || text.replace(/^姓名\s*$/m, "").trim().length > 0;

  const set = (key: keyof ResumeData, value: string) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("请选择图片文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("图片过大，请选择 2MB 以内的图片");
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
    } catch (err: any) {
      alert("下载失败：" + err.message);
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
        <nav className="nav">
          <Link to="/">评估简历</Link>
          <Link to="/history">历史记录</Link>
        </nav>
        <p>没有简历？按模板填写内容，自动排版、可下载、还能直接去评估</p>
      </div>

      <div className="builder">
        <div className="builder-form card">
          <div className="builder-toolbar">
            <span className="builder-toolbar-label">模板风格</span>
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
