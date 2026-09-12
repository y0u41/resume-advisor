export default function JdCard({
  jobUrl,
  jobDescription,
}: {
  jobUrl: string;
  jobDescription: string;
}) {
  if (!jobUrl && !jobDescription) return null;
  return (
    <div className="card">
      <h3 style={{ marginBottom: 10, fontSize: "0.95rem", color: "var(--text-secondary)" }}>
        原始 JD
      </h3>
      {jobUrl && (
        <a className="jd-link" href={jobUrl} target="_blank" rel="noreferrer">
          🔗 {jobUrl}
        </a>
      )}
      {jobDescription && (
        <div
          style={{
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            whiteSpace: "pre-wrap",
            marginTop: jobUrl ? 10 : 0,
          }}
        >
          {jobDescription}
        </div>
      )}
    </div>
  );
}
