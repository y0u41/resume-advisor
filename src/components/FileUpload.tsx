import { useRef, useState } from "react";
import { useToast } from "../lib/ui/toast";

interface Props {
  onText: (text: string) => void;
  label?: string;
}

export default function FileUpload({ onText, label = "上传文件" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [filename, setFilename] = useState("");
  const [dragging, setDragging] = useState(false);
  const toast = useToast();

  const handleFile = async (file: File) => {
    setUploading(true);
    setFilename(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-file", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        toast("文件解析失败：" + (data.error || "未知错误"), "error");
        setFilename("");
        return;
      }

      onText(data.text);
    } catch (err: any) {
      toast("上传失败：" + err.message, "error");
      setFilename("");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      className={`dropzone ${dragging ? "dragging" : ""} ${uploading ? "uploading" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.md,.jpg,.jpeg,.png,.webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {uploading ? (
        <span className="dropzone-text">
          <span className="spinner spinner-sm" style={{ color: "var(--primary)" }} /> 解析中...
        </span>
      ) : (
        <span className="dropzone-text">
          <span className="dropzone-icon">📎</span>
          点击或拖拽文件到此处（{label}）
        </span>
      )}

      {filename && !uploading && <span className="file-name">已导入：{filename}</span>}
      <span className="dropzone-hint">支持 PDF / Word / 图片（自动识别）/ TXT，单个 ≤ 10MB</span>
    </div>
  );
}
