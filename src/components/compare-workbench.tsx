"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { Comparison } from "@/lib/db/repository";
import { FACTOR_LABELS } from "@/lib/types";

interface Option {
  id: string;
  title: string;
  score: number;
  verdict: string;
}

export function CompareWorkbench({ options }: { options: Option[] }) {
  const reduce = useReducedMotion();
  const [left, setLeft] = useState(options[0]?.id ?? "");
  const [right, setRight] = useState(options[1]?.id ?? "");
  const [result, setResult] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!left || !right || left === right) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ left_id: left, right_id: right }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Comparison failed.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed.");
    } finally {
      setBusy(false);
    }
  }

  const titleOf = (id: string) => options.find((o) => o.id === id)?.title ?? "—";

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="panel flex flex-col gap-4 p-5">
        <p className="field-label">Choose two reports</p>
        <div>
          <label htmlFor="cmp-left" className="field-label mb-1.5 block">
            Left
          </label>
          <select id="cmp-left" className="input" value={left} onChange={(e) => setLeft(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} ({o.score})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cmp-right" className="field-label mb-1.5 block">
            Right
          </label>
          <select id="cmp-right" className="input" value={right} onChange={(e) => setRight(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} ({o.score})
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-primary w-full !py-2 text-xs" onClick={run} disabled={busy || !left || left === right}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Compare
        </button>
        {left === right && left && (
          <p className="text-xs text-amber">Pick two different reports.</p>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
            {error}
          </p>
        )}
      </div>

      <div className="panel flex flex-col p-5">
        <p className="field-label mb-3">Factor-by-factor gap</p>
        {!result ? (
          <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
            <p className="max-w-sm text-xs leading-relaxed text-fog">
              Compare two saved reports to see which channel scores higher and exactly which factors
              drive the gap.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-ink px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-snow">{result.summary}</p>
                <p className="mt-1 font-mono text-[0.6875rem] text-fog">
                  {titleOf(result.left.id)} {result.left.score} — {result.right.score}{" "}
                  {titleOf(result.right.id)} · gap {result.scoreGap > 0 ? "+" : ""}
                  {result.scoreGap}
                </p>
              </div>
              <span
                className={`chip ${
                  result.winner === "tie"
                    ? "!border-fog/40 !text-fog"
                    : "!border-mint/40 !text-mint"
                }`}
              >
                {result.winner === "tie" ? "too close to call" : `${result.winner === "left" ? titleOf(result.left.id) : titleOf(result.right.id)} leads`}
              </span>
            </div>

            <ul className="mt-4 flex flex-col gap-2">
              {result.factorGaps.map((g) => {
                const max = Math.max(...result.factorGaps.map((x) => Math.abs(x.delta)), 1);
                const pct = (Math.abs(g.delta) / max) * 100;
                const color = g.delta > 0 ? "#22d3ee" : g.delta < 0 ? "#fb7185" : "#94a3b8";
                return (
                  <li key={g.key} className="panel-inset px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-snow">
                        {FACTOR_LABELS[g.key as keyof typeof FACTOR_LABELS] ?? g.label}
                      </span>
                      <span className="font-mono text-xs" style={{ color }}>
                        {g.delta > 0 ? "+" : ""}
                        {g.delta}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: color, width: `${pct}%` }}
                        initial={reduce ? false : { width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
