import { verdictColor } from "./verdict-badge";

export function ScoreGauge({ score, size = 160 }: { score: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score, 0), 100) / 100;
  const color = verdictColor(score >= 70 ? "trusted" : score >= 55 ? "mostly_reliable" : score >= 40 ? "mixed" : "low_credibility");

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`Credibility score ${score} out of 100`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#212b34"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tracking-tight" style={{ color }}>
          {score}
        </span>
        <span className="field-label mt-1">/ 100</span>
      </div>
    </div>
  );
}
