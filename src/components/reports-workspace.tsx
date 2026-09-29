"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import Link from "next/link";
import type { ReportRow } from "@/lib/types";
import { VerdictBadge } from "./verdict-badge";

function Workspace({ initialReports }: { initialReports: ReportRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "date";
  const filter = params.get("verdict") ?? "";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/reports?${next.toString()}`, { scroll: false });
  };

  const reports = useMemo(() => {
    let list = initialReports;
    if (filter) list = list.filter((r) => r.verdict === filter);
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.channel_title.toLowerCase().includes(needle) ||
          r.channel_handle.toLowerCase().includes(needle),
      );
    }
    if (sort === "score") list = [...list].sort((a, b) => b.score - a.score);
    return list;
  }, [initialReports, q, sort, filter]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="input sm:max-w-xs"
          placeholder="Filter by channel…"
          defaultValue={q}
          onChange={(e) => setParam("q", e.target.value)}
          aria-label="Filter reports by channel"
        />
        <div className="flex flex-wrap items-center gap-2">
          {["", "trusted", "mostly_reliable", "mixed", "low_credibility"].map((v) => (
            <button
              key={v || "all"}
              type="button"
              onClick={() => setParam("verdict", v)}
              className={`chip cursor-pointer transition-colors ${
                filter === v ? "border-phosphor/60 text-phosphor" : "hover:text-snow"
              }`}
              aria-pressed={filter === v}
            >
              {v === "" ? "all" : v.replace(/_/g, " ")}
            </button>
          ))}
          <select
            className="input !w-auto !py-1.5 text-xs"
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
            aria-label="Sort reports"
          >
            <option value="date">Newest first</option>
            <option value="score">Highest score</option>
          </select>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="panel mt-6 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-sm font-medium text-snow">
            {initialReports.length === 0 ? "No reports yet" : "No reports match these filters"}
          </p>
          <p className="max-w-sm text-xs text-fog">
            {initialReports.length === 0
              ? "Analyze a YouTube channel and your report will appear here, sealed and replayable."
              : "Try clearing the search or choosing a different verdict filter."}
          </p>
          {initialReports.length === 0 && (
            <Link href="/" className="btn-primary mt-2">
              Analyze a channel
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reports/${r.id}`}
                className="panel group flex h-full flex-col gap-3 p-5 transition-colors hover:border-phosphor/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-snug text-snow group-hover:text-phosphor">
                    {r.channel_title}
                  </h3>
                  <span className="font-mono text-lg font-semibold text-snow">{r.score}</span>
                </div>
                <p className="text-xs text-fog">{r.channel_handle || r.channel_id}</p>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <VerdictBadge verdict={r.verdict} size="sm" />
                  <span className="font-mono text-[0.6875rem] text-fog">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReportsWorkspace({ initialReports }: { initialReports: ReportRow[] }) {
  return (
    <Suspense fallback={<div className="panel mt-6 h-40 animate-pulse" />}>
      <Workspace initialReports={initialReports} />
    </Suspense>
  );
}
