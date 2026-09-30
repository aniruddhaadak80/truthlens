"use client";

import { useState } from "react";
import type { Claim, ClaimCategory, Stance, TranscriptCoverage } from "@/lib/types";

const CATEGORY_META: Record<ClaimCategory, { label: string; color: string; hint: string }> = {
  empirical: { label: "Empirical", color: "#22d3ee", hint: "Measurable and checkable against data." },
  causal: { label: "Causal", color: "#a78bfa", hint: "Claims A caused B; needs a controlled comparison." },
  predictive: { label: "Predictive", color: "#fbbf24", hint: "A claim about what will happen." },
  normative: { label: "Normative", color: "#34d399", hint: "A value judgement rather than a fact." },
  attribution: { label: "Attributed", color: "#94a3b8", hint: "Points at a named source." },
  vague: { label: "Vague", color: "#fb7185", hint: "Hard to check or falsify as stated." },
};

const STANCE_META: Record<Stance, { label: string; color: string }> = {
  hedge: { label: "hedged", color: "#34d399" },
  assert: { label: "asserted", color: "#94a3b8" },
  overclaim: { label: "overclaim", color: "#fb7185" },
};

export function CoverageBadge({ coverage }: { coverage: TranscriptCoverage }) {
  const tone =
    coverage.status === "full"
      ? "border-mint/40 text-mint"
      : coverage.status === "partial"
        ? "border-amber/40 text-amber"
        : "border-line text-fog";
  return (
    <span className={`chip ${tone}`} title={coverage.note}>
      {coverage.status === "full"
        ? `captions ${coverage.videosWithTranscript}/${coverage.videosSampled}`
        : coverage.status === "partial"
          ? `captions ${coverage.videosWithTranscript}/${coverage.videosSampled}`
          : "titles only"}
      {coverage.totalWords > 0 && ` · ${coverage.totalWords.toLocaleString()} words`}
    </span>
  );
}

export function ClaimLedger({
  claims,
  byCategory,
  hedgeRatio,
  overclaimRatio,
  falsifiableRatio,
  coverageLabel,
}: {
  claims: Claim[];
  byCategory: Record<ClaimCategory, number>;
  hedgeRatio: number;
  overclaimRatio: number;
  falsifiableRatio: number;
  coverageLabel: string;
}) {
  const [filter, setFilter] = useState<ClaimCategory | "all" | "load">("load");
  const [query, setQuery] = useState("");

  const visible = claims.filter((c) => {
    if (filter === "load" && !c.loadBearing) return false;
    if (filter !== "all" && filter !== "load" && c.category !== filter) return false;
    if (query && !c.text.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const ratios = [
    { label: "falsifiable", value: falsifiableRatio, color: "#22d3ee" },
    { label: "hedged", value: hedgeRatio, color: "#34d399" },
    { label: "overclaim", value: overclaimRatio, color: "#fb7185" },
  ];

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="field-label">Claim ledger</p>
          <p className="mt-1 text-xs text-fog">
            {claims.length} claims extracted from {coverageLabel === "titles+transcript" ? "captions and titles" : "titles and descriptions"}
          </p>
        </div>
        <div className="flex gap-4">
          {ratios.map((r) => (
            <div key={r.label} className="text-right">
              <p className="font-mono text-sm" style={{ color: r.color }}>
                {(r.value * 100).toFixed(0)}%
              </p>
              <p className="field-label">{r.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="input sm:max-w-56"
          placeholder="Search claims…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search claims"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["all", "load", ...Object.keys(CATEGORY_META)] as const).map((key) => {
            const label =
              key === "all" ? "all" : key === "load" ? "load-bearing" : CATEGORY_META[key as ClaimCategory].label;
            const count =
              key === "all"
                ? claims.length
                : key === "load"
                  ? claims.filter((c) => c.loadBearing).length
                  : byCategory[key as ClaimCategory];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as ClaimCategory | "all" | "load")}
                className={`chip cursor-pointer !text-[0.6875rem] transition-colors ${
                  filter === key ? "border-phosphor/60 text-phosphor" : "hover:text-snow"
                }`}
                aria-pressed={filter === key}
              >
                {label} {count}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-md border border-line bg-ink px-4 py-8 text-center text-xs text-fog">
          No claims match this filter.
        </p>
      ) : (
        <ul className="mt-4 flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
          {visible.map((c) => (
            <li key={c.id} className="panel-inset px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span
                  className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: CATEGORY_META[c.category].color }}
                  title={CATEGORY_META[c.category].hint}
                  aria-hidden="true"
                />
                <p className="flex-1 text-xs leading-relaxed text-snow">{c.text}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="chip !text-[0.625rem]" style={{ color: CATEGORY_META[c.category].color }}>
                  {CATEGORY_META[c.category].label}
                </span>
                <span className="chip !text-[0.625rem]" style={{ color: STANCE_META[c.stance].color }}>
                  {STANCE_META[c.stance].label}
                </span>
                <span className="chip !text-[0.625rem]">{c.source}</span>
                {c.loadBearing && <span className="chip !border-violet/40 !text-[0.625rem] !text-violet">load-bearing</span>}
                {c.timestampSeconds !== undefined && (
                  <a
                    href={`${c.videoUrl}&t=${Math.floor(c.timestampSeconds)}s`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip !text-[0.625rem] hover:text-phosphor"
                  >
                    {Math.floor(c.timestampSeconds / 60)}:{String(Math.floor(c.timestampSeconds % 60)).padStart(2, "0")}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
