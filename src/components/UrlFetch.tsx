import { useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onFetched: (text: string, url: string) => void;
}

export default function UrlFetch({ value, onChange, onFetched }: Props) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleFetch = async () => {
    const url = value.trim();
    if (!url) return;

    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg(data.error || "抓取失败");
        return;
      }

      onFetched(data.text, data.url || url);
      setMsg(`已抓取 ${data.length} 字${data.title ? "：" + data.title : ""}`);
    } catch (err: any) {
      setMsg("抓取失败：" + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="url-fetch">
      <input
        type="url"
        placeholder="粘贴岗位链接（招聘网站 JD 页面），点右侧自动抓取"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={loading || !value.trim()}
        onClick={handleFetch}
      >
        {loading ? (
          <>
            <span className="spinner spinner-sm" /> 抓取中
          </>
        ) : (
          "🔗 抓取"
        )}
      </button>
      {msg && <span className="url-msg">{msg}</span>}
    </div>
  );
}
