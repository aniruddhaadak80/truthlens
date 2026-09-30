"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { DriftReport } from "@/lib/db/repository";
import type { VideoOutlier } from "@/lib/types";

function DriftChart({ points }: { points: DriftReport["points"] }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const w = 560;
  const h = 140;
  const pad = { top: 12, right: 12, bottom: 20, left: 30 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const xs = points.map((_, i) => (points.length === 1 ? pad.left + innerW / 2 : pad.left + (i / (points.length - 1)) * innerW));
  const ys = points.map((p) => pad.top + innerH - (p.score / 100) * innerH);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Credibility score over time">
      {[0, 50, 100].map((y) => (
        <g key={y}>
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={pad.top + innerH - (y / 100) * innerH}
            y2={pad.top + innerH - (y / 100) * innerH}
            stroke="#1e262e"
            strokeWidth="1"
          />
          <text x={4} y={pad.top + innerH - (y / 100) * innerH + 4} fill="#55636f" fontSize="9" fontFamily="monospace">
            {y}
          </text>
        </g>
      ))}
      {points.length > 1 && (
        <motion.path
          d={path}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      )}
      {points.map((p, i) => (
        <g
          key={i}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          style={{ cursor: "pointer" }}
        >
          <circle
            cx={xs[i]}
            cy={ys[i]}
            r={hover === i ? 5 : 3.5}
            fill="#0a0d10"
            stroke="#22d3ee"
            strokeWidth="2"
          />
          <title>{`${p.score}/100 · ${p.verdict} · ${new Date(p.analyzedAt).toLocaleDateString()}`}</title>
        </g>
      ))}
      {hover !== null && (
        <text
          x={Math.min(Math.max(xs[hover], pad.left + 24), w - pad.right - 24)}
          y={Math.max(ys[hover] - 10, pad.top + 8)}
          fill="#e6edf3"
          fontSize="10"
          textAnchor="middle"
          fontFamily="monospace"
        >
          {points[hover].score}
        </text>
      )}
      {points.length > 0 && (
        <>
          <text x={pad.left} y={h - 4} fill="#55636f" fontSize="9" fontFamily="monospace">
            {new Date(points[0].analyzedAt).toLocaleDateString()}
          </text>
          <text x={w - pad.right} y={h - 4} fill="#55636f" fontSize="9" textAnchor="end" fontFamily="monospace">
            {new Date(points[points.length - 1].analyzedAt).toLocaleDateString()}
          </text>
        </>
      )}
    </svg>
  );
}

export function DriftPanel({ drift }: { drift: DriftReport }) {
  const tone =
    drift.direction === "rising"
      ? "text-mint"
      : drift.direction === "falling"
        ? "text-rose"
        : drift.direction === "stable"
          ? "text-phosphor"
          : "text-fog";

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="field-label">Credibility drift</p>
        {drift.delta !== null && (
          <span className={`font-mono text-sm ${tone}`}>
            {drift.delta > 0 ? "▲" : drift.delta < 0 ? "▼" : "■"} {Math.abs(drift.delta)}
          </span>
        )}
      </div>
      {drift.points.length === 0 ? (
        <p className="mt-4 text-xs leading-relaxed text-fog">{drift.summary}</p>
      ) : (
        <>
          <div className="mt-2">
            <DriftChart points={drift.points} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fog">{drift.summary}</p>
          <p className="mt-1 font-mono text-[0.6875rem] text-fog">
            {drift.points.length} reading{drift.points.length === 1 ? "" : "s"} ·{" "}
            {drift.points[drift.points.length - 1].transcriptCoverage === "titles-only"
              ? "titles only"
              : "captions included"}
          </p>
        </>
      )}
    </div>
  );
}

export function OutlierList({ outliers, meanScore }: { outliers: VideoOutlier[]; meanScore: number }) {
  if (outliers.length === 0) {
    return (
      <div className="panel p-5">
        <p className="field-label">Per-video outliers</p>
        <p className="mt-3 text-xs leading-relaxed text-fog">
          No sampled video fell far below the channel average of {meanScore}/100. The record is
          consistent.
        </p>
      </div>
    );
  }
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="field-label">Per-video outliers</p>
        <span className="chip !border-rose/40 !text-rose">{outliers.length}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fog">
        Videos that scored far below the channel average of {meanScore}/100 — a strong average can
        hide a few bad episodes.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {outliers.map((o) => (
          <li key={o.url} className="panel-inset px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs leading-snug text-snow hover:text-phosphor"
              >
                {o.title}
              </a>
              <span className="shrink-0 font-mono text-sm text-rose">{o.score}</span>
            </div>
            {o.flags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {o.flags.map((f) => (
                  <span key={f} className="chip !text-[0.625rem]">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
