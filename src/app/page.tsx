import Link from "next/link";
import { getRepository } from "@/lib/db";
import { AnalyzeForm } from "@/components/analyze-form";
import { siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const FACTOR_PREVIEW = [
  { key: "claim_discipline", label: "Claim discipline", desc: "Absolute claims and suppression narratives vs. hedged, falsifiable language." },
  { key: "controversy_temperature", label: "Controversy temperature", desc: "Outrage and attack vocabulary that crowds out nuance." },
  { key: "clickbait_pressure", label: "Clickbait pressure", desc: "Caps-shouting, bait phrases, and punctuation spam in titles." },
  { key: "sentiment_balance", label: "Sentiment balance", desc: "Whether titles lean constructive or fear-driven." },
  { key: "cadence_consistency", label: "Cadence consistency", desc: "Upload regularity, volume, and recency of the public record." },
  { key: "transparency", label: "Transparency", desc: "Description depth, source links, and sponsorship disclosure." },
];

export default async function HomePage() {
  let stats = { total: 0, trusted: 0, low: 0 };
  try {
    const repo = await getRepository();
    const dist = await repo.verdictDistribution();
    const sum = dist.reduce((s, d) => s + d.count, 0);
    stats = {
      total: sum,
      trusted: dist.find((d) => d.verdict === "trusted")?.count ?? 0,
      low: dist.find((d) => d.verdict === "low_credibility")?.count ?? 0,
    };
  } catch {
    stats = { total: 0, trusted: 0, low: 0 };
  }

  return (
    <div>
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-3xl">
            <p className="field-label mb-4 flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-phosphor" aria-hidden="true" />
              Deterministic credibility engine · v{siteConfig.engineVersion}
            </p>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              Is this creator
              <br />
              <span className="text-phosphor">worth your time?</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-fog sm:text-lg">
              Paste any YouTube channel link. TruthLens refracts the channel&apos;s public video
              record into an evidence-backed credibility report — every score traced to the exact
              phrases that produced it.
            </p>
            <div className="mt-8">
              <AnalyzeForm />
            </div>
          </div>

          <div className="mt-14 grid grid-cols-3 gap-3 sm:gap-4">
            <div className="panel p-4 sm:p-5">
              <p className="text-2xl font-semibold text-snow sm:text-3xl">{stats.total}</p>
              <p className="field-label mt-1">channels analyzed</p>
            </div>
            <div className="panel p-4 sm:p-5">
              <p className="text-2xl font-semibold text-mint sm:text-3xl">
                {stats.total > 0 ? Math.round((stats.trusted / stats.total) * 100) : 0}%
              </p>
              <p className="field-label mt-1">rated worth your time</p>
            </div>
            <div className="panel p-4 sm:p-5">
              <p className="text-2xl font-semibold text-rose sm:text-3xl">
                {stats.total > 0 ? Math.round((stats.low / stats.total) * 100) : 0}%
              </p>
              <p className="field-label mt-1">flagged low credibility</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Six signals, one verdict</h2>
          <p className="mt-2 max-w-2xl text-sm text-fog">
            The engine reads titles, descriptions, and publish dates from the channel&apos;s public
            RSS feed — no API key, no account. Every factor is explainable and every report is
            sealed into an auditable hash chain.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FACTOR_PREVIEW.map((f, i) => (
              <div key={f.key} className="panel p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-phosphor">{String(i + 1).padStart(2, "0")}</span>
                  <span className="h-1 w-8 rounded bg-line" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-snow">{f.label}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-fog">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="panel flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Agent-ready from minute one</h2>
              <p className="mt-1.5 max-w-lg text-sm text-fog">
                TruthLens exposes a JSON-RPC 2.0 MCP endpoint with tools to analyze, read, decide,
                and verify — the same mutation paths the UI uses.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/agent" className="btn-primary">
                Open the agent console
              </Link>
              <a
                href={siteConfig.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                View source
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
