import { parseReport, sectionIcon } from "../../lib/report/report";
import MatchSection from "./MatchSection";
import KeywordChips from "./KeywordChips";

export default function ReportView({ report }: { report: string }) {
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
          ) : s.title.includes("关键词") ? (
            <KeywordChips content={s.content} />
          ) : (
            <div className="report">{s.content}</div>
          )}
        </div>
      ))}
    </>
  );
}
