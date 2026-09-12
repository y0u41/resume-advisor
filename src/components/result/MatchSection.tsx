import { parseMatchItems, matchRate, type MatchStatus } from "../../lib/report/report";

const ICONS: Record<MatchStatus, string> = {
  ok: "✅",
  partial: "⚠️",
  miss: "❌",
};

export default function MatchSection({ content }: { content: string }) {
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
