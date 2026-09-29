"use client";

import { useMemo, useState } from "react";
import type { FactorResult, PhraseEvidence, VideoSample } from "@/lib/types";
import { factorColor } from "./refraction-lens";

function Highlighted({ text, phrases }: { text: string; phrases: PhraseEvidence[] }) {
  const pattern = useMemo(() => {
    const active = phrases.filter((p) => p.phrase.length > 1);
    if (active.length === 0) return null;
    return new RegExp(
      `(${active.map((p) => p.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      "gi",
    );
  }, [phrases]);

  if (!pattern) return <span>{text}</span>;
  const parts = text.split(pattern);
  return (
    <span>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark key={i} className="rounded-sm bg-amber/25 px-0.5 text-amber">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

export function FactorBreakdown({
  factors,
  videos,
}: {
  factors: FactorResult[];
  videos: VideoSample[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const activeFactor = factors.find((f) => f.key === active) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel p-5">
        <p className="field-label mb-4">Factor breakdown</p>
        <ul className="flex flex-col gap-3">
          {factors.map((f) => {
            const color = factorColor(f.key);
            const isActive = active === f.key;
            return (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => setActive(isActive ? null : f.key)}
                  aria-expanded={isActive}
                  className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                    isActive ? "border-phosphor/50 bg-panel2" : "border-transparent hover:bg-panel2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-snow">{f.label}</span>
                    <span className="font-mono text-xs" style={{ color }}>
                      {f.score}
                      <span className="text-fog"> · w{Math.round(f.weight * 100)}%</span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${f.score}%`, background: color }}
                    />
                  </div>
                  <p className="mt-2 text-[0.6875rem] leading-relaxed text-fog">{f.explanation}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="panel flex flex-col p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="field-label">Evidence — matched phrases</p>
          {activeFactor && (
            <span className="chip" style={{ color: factorColor(activeFactor.key) }}>
              {activeFactor.label}
            </span>
          )}
        </div>
        {!activeFactor ? (
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
            <p className="max-w-xs text-xs leading-relaxed text-fog">
              Select a factor to see the exact phrases in the channel&apos;s videos that moved its
              score.
            </p>
          </div>
        ) : activeFactor.evidence.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
            <p className="max-w-xs text-xs leading-relaxed text-fog">
              No matching phrases — this factor scored clean on the sampled videos.
            </p>
          </div>
        ) : (
          <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
            {videos.map((v, i) => {
              const matched = activeFactor.evidence.filter((e) =>
                `${v.title} ${v.description}`.toLowerCase().includes(e.phrase.toLowerCase()),
              );
              if (matched.length === 0) return null;
              return (
                <li key={i} className="panel-inset px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-snow">
                    <Highlighted text={v.title} phrases={matched} />
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {matched.map((m) => (
                      <span key={m.phrase} className="chip !text-[0.625rem]">
                        {m.phrase} ×{m.count}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
