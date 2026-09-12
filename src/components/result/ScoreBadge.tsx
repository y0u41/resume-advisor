export default function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const cls = score >= 7 ? "score-high" : score >= 4 ? "score-mid" : "score-low";
  return (
    <div className={`score-badge ${cls}`}>
      {score}
      <small>/ 10</small>
    </div>
  );
}
