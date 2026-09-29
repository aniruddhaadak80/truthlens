"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download } from "lucide-react";
import type { ReportRow } from "@/lib/types";
import { VerdictBadge } from "@/components/verdict-badge";

export default function ExportPage() {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports?limit=100")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json())?.error?.message ?? "Load failed");
        return res.json();
      })
      .then((d) => setReports(d.reports))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="field-label mb-2">Take it with you</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Export center</h1>
      <p className="mt-1 text-sm text-fog">
        Download a self-contained JSON report or copy a public share link. Exports include source
        attribution, timestamps, and a safety disclaimer.
      </p>

      <div className="mt-8">
        {error && (
          <p role="alert" className="rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
            {error}
          </p>
        )}
        {!reports && !error && <div className="panel h-32 animate-pulse" />}
        {reports && reports.length === 0 && (
          <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-sm text-snow">Nothing to export yet</p>
            <Link href="/" className="btn-primary">Analyze a channel</Link>
          </div>
        )}
        {reports && reports.length > 0 && (
          <ul className="flex flex-col gap-3">
            {reports.map((r) => (
              <li key={r.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link href={`/reports/${r.id}`} className="text-sm font-semibold text-snow hover:text-phosphor">
                    {r.channel_title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-fog">{r.score}/100</span>
                    <VerdictBadge verdict={r.verdict} size="sm" />
                    <span className="font-mono text-[0.6875rem] text-fog">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a href={`/api/export/${r.id}`} className="btn-ghost !px-3 !py-1.5 text-xs" download>
                    <Download className="h-3.5 w-3.5" />
                    JSON
                  </a>
                  <button
                    type="button"
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${window.location.origin}/share/${r.id}`);
                      setCopiedId(r.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                  >
                    {copiedId === r.id ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === r.id ? "Copied" : "Share link"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
