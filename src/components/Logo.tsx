interface Props {
  size?: number;
}

export default function Logo({ size = 40 }: Props) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-label="简历参谋" role="img">
      <defs>
        <linearGradient id="yuLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3f3f46" />
          <stop offset="0.55" stopColor="#27272a" />
          <stop offset="1" stopColor="#0a0a0b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#yuLogoGrad)" />
      <g
        fill="none"
        stroke="#ffffff"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7.4 19.2 Q12.2 27.5 15.7 34.9" />
        <path d="M24 19.2 Q15.7 35.2 8.6 50.2" />
        <path d="M32 19.2 L32 35.2 Q32 46.1 39 46.1 Q46.1 46.1 46.1 35.2 L46.1 19.2" />
        <path d="M45.8 35.2 Q48.6 42.2 51.5 48.3" />
      </g>
    </svg>
  );
}
