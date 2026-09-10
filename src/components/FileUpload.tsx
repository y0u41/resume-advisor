import { useRef, useState } from "react";

interface Props {
  onText: (text: string) => void;
  label?: string;
}

export default function FileUpload({ onText, label = "上传文件" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [filename, setFilename] = useState("");

  const handleFile = async (file: File) => {
    setUploading(true);
    setFilename(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-file", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        alert("文件解析失败：" + (data.error || "未知错误"));
        setFilename("");
        return;
      }

      onText(data.text);
    } catch (err: any) {
      alert("上传失败：" + err.message);
      setFilename("");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="file-upload">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.md"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <>
            <span className="spinner spinner-sm" /> 解析中...
          </>
        ) : (
          <>📎 {label}</>
        )}
      </button>
      {filename && !uploading && (
        <span className="file-name">已导入：{filename}</span>
      )}
      <span className="file-hint">支持 PDF / Word / TXT（扫描版 PDF 无法识别）</span>
    </div>
  );
}
