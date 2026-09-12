export default function KeywordChips({ content }: { content: string }) {
  const words = content
    .split(/[、,，\n；;]+/)
    .map((s) => s.replace(/^[\s\-*•【】]+|[\s:：]+$/g, "").trim())
    .filter((s) => s.length > 0 && s.length <= 30);
  if (words.length === 0) return <div className="report">{content}</div>;
  return (
    <div>
      <div className="chips">
        {words.map((w, i) => (
          <span key={i} className="chip chip-miss">
            {w}
          </span>
        ))}
      </div>
      <p className="hint">以上是简历里缺失、建议补上的关键词（有助通过 ATS 机器筛选）。</p>
    </div>
  );
}
