"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { FactorResult } from "@/lib/types";

const FACTOR_COLORS: Record<string, string> = {
  claim_discipline: "#22d3ee",
  controversy_temperature: "#fb7185",
  clickbait_pressure: "#fbbf24",
  sentiment_balance: "#a78bfa",
  cadence_consistency: "#34d399",
  transparency: "#94a3b8",
};

export function factorColor(key: string): string {
  return FACTOR_COLORS[key] ?? "#22d3ee";
}

export function RefractionLens({
  factors,
  activeFactor,
  onSelect,
}: {
  factors: FactorResult[];
  activeFactor: string | null;
  onSelect: (key: string | null) => void;
}) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const selected = activeFactor ?? hovered;
  const total = factors.reduce((s, f) => s + f.contribution, 0) || 1;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="field-label">Refraction — one signal, six factors</p>
        <p className="font-mono text-[0.6875rem] text-fog">beam width ∝ contribution</p>
      </div>
      <div className="px-5 py-6">
        <svg viewBox="0 0 640 190" className="w-full" role="img" aria-label="Prism diagram splitting the credibility signal into six factor beams">
          <defs>
            <linearGradient id="beam-in" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          <motion.line
            x1="10" y1="95" x2="255" y2="95"
            stroke="url(#beam-in)" strokeWidth="3" strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />

          <motion.polygon
            points="320,45 270,145 370,145"
            fill="rgba(34,211,238,0.06)"
            stroke="#22d3ee"
            strokeWidth="1.5"
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            style={{ transformOrigin: "320px 95px" }}
          />
          <text x="320" y="100" textAnchor="middle" fill="#22d3ee" fontSize="11" fontFamily="monospace">
            LENS
          </text>

          {factors.map((f, i) => {
            const y = 22 + i * 29;
            const width = Math.max(2, (f.contribution / total) * 200);
            const color = factorColor(f.key);
            const isActive = selected === f.key;
            return (
              <g
                key={f.key}
                onMouseEnter={() => setHovered(f.key)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(isActive ? null : f.key)}
                style={{ cursor: "pointer" }}
                role="button"
                aria-label={`${f.label}: score ${f.score}, weight ${Math.round(f.weight * 100)}%`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(isActive ? null : f.key);
                  }
                }}
              >
                <motion.line
                  x1="372" y1="95" x2={372 + width} y2={y}
                  stroke={color}
                  strokeWidth={isActive ? 5 : 2.5}
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: isActive ? 1 : 0.75 }}
                  transition={{ duration: 0.6, delay: 0.15 + i * 0.07, ease: "easeOut" }}
                />
                <text
                  x={378 + width}
                  y={y + 4}
                  fill={isActive ? color : "#8b98a5"}
                  fontSize="10.5"
                  fontFamily="monospace"
                >
                  {f.label} · {f.score}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
