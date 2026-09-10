interface Props {
  size?: number;
}

export default function Logo({ size = 40 }: Props) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-label="简历评估助手" role="img">
      <defs>
        <linearGradient id="yuLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.42" stopColor="#8b5cf6" />
          <stop offset="0.7" stopColor="#fb7185" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#yuLogoGrad)" />
      <text
        x="32"
        y="45"
        textAnchor="middle"
        fontFamily="'Segoe UI', Arial, Helvetica, sans-serif"
        fontSize="34"
        fontWeight="700"
        fill="#ffffff"
      >
        yu
      </text>
    </svg>
  );
}
