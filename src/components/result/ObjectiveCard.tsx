import type { ObjectiveScore } from "../../lib/report/report";

export default function ObjectiveCard({
  objective,
  llmScore,
}: {
  objective?: ObjectiveScore | null;
  llmScore?: number | null;
}) {
  if (!objective) return null;
  const rate =
    typeof objective.matchRate === "number" ? Math.round(objective.matchRate * 100) : null;
  const missing = objective.missing || [];
  // LLM 十分制换算成百分制，与算法客观分对比
  const llm100 = llmScore != null ? Math.round(llmScore * 10) : null;
  const disagree = llm100 != null && Math.abs(llm100 - objective.score) >= 20;

  return (
    <div className="card">
      <h2 className="section-title">
        <span className="section-icon">📐</span>
        客观评分（算法）
      </h2>

      <div className="objective-summary">
        <div
          className={`score-badge ${
            objective.score >= 80 ? "score-high" : objective.score >= 60 ? "score-mid" : "score-low"
          }`}
        >
          {objective.score}
          <small>/ 100</small>
        </div>
        {rate !== null && (
          <div className="objective-rate">
            <div className="match-rate-label">
              <span>关键词匹配度</span>
              <span>{rate}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ ["--target-width" as string]: `${rate}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="objective-dims">
        {objective.dimensions.map((d) => (
          <div className="objective-dim" key={d.name}>
            <div className="objective-dim-head">
              <span>{d.label}</span>
              <span>
                {d.score} 分 · 权重 {Math.round(d.weight * 100)}%
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ ["--target-width" as string]: `${d.score}%` }} />
            </div>
            <div className="objective-dim-reason">{d.reason}</div>
          </div>
        ))}
      </div>

      {missing.length > 0 && (
        <div className="objective-missing">
          <div className="objective-missing-title">缺失关键词（{missing.length}）</div>
          <div className="chips">
            {missing.slice(0, 20).map((k) => (
              <span key={k.canonical} className="chip chip-miss">
                {k.canonical}
              </span>
            ))}
          </div>
        </div>
      )}

      {objective.ats && (
        <div className="objective-missing">
          <div className="objective-missing-title">
            ATS 可解析性 · {objective.ats.score}/100（简历能否被机器正确解析）
          </div>
          <div className="ats-checks">
            {objective.ats.checks.map((c) => (
              <div key={c.key} className={`ats-check ats-${c.status}`}>
                <span className="ats-icon">
                  {c.status === "ok" ? "✅" : c.status === "fail" ? "❌" : "⚠️"}
                </span>
                <span className="ats-label">{c.label}</span>
                <span className="ats-detail">{c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="hint">
        该分数由内置算法（关键词匹配 + 四维评分）确定性计算，与上方 AI 报告相互印证、可复现。
      </p>
      {disagree && (
        <p className="hint" style={{ marginTop: 6 }}>
          AI 评分（{llmScore}/10）与算法客观分（{objective.score}/100）差异较大：AI 更侧重经历、表达等语义因素，算法更侧重关键词覆盖与量化等硬指标。建议以 AI 的改进建议为主，同时对照上方「缺失关键词」补齐短板。
        </p>
      )}
    </div>
  );
}
