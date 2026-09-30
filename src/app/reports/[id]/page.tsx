import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepository } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { ScoreGauge } from "@/components/score-gauge";
import { VerdictBadge } from "@/components/verdict-badge";
import { ReportVisuals } from "@/components/report-visuals";
import { ReportActions } from "@/components/report-actions";
import { ClaimLedger, CoverageBadge } from "@/components/claim-ledger";
import { DriftPanel, OutlierList } from "@/components/drift-panel";
import { getDrift } from "@/lib/service";
import { verifyChain } from "@/lib/integrity/chain";
import { analyzeChannel } from "@/lib/engine/credibility";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = await getSessionId();
  const repo = await getRepository();
  const report = await repo.getReport(id, sessionId);
  if (!report) notFound();

  const auditEvents = await repo.listAudit("report", id, 50);
  const chain = verifyChain(auditEvents);
  const drift = await getDrift(report.channel_id).catch(() => null);

  // Re-derive the claim ledger and outliers from the stored per-video metadata
  // so the page reflects exactly what was scored at analysis time.
  const videos = report.sample_videos;
  const engine = analyzeChannel({ channelTitle: report.channel_title, videos });
  const meanVideo =
    videos.filter((v) => typeof v.perVideoScore === "number").reduce((s, v) => s + (v.perVideoScore ?? 0), 0) /
    Math.max(1, videos.filter((v) => typeof v.perVideoScore === "number").length);


  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-xs text-fog" aria-label="Breadcrumb">
        <Link href="/reports" className="hover:text-snow">Reports</Link>
        <span aria-hidden="true">/</span>
        <span className="text-snow">{report.channel_title}</span>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <div className="panel flex flex-col items-center gap-4 p-6">
            <ScoreGauge score={report.score} />
            <VerdictBadge verdict={report.verdict} />
            <div className="w-full space-y-2 border-t border-line pt-4 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-fog">Channel</span>
                <span className="text-right text-snow">{report.channel_title}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-fog">Handle</span>
                <span className="font-mono text-snow">{report.channel_handle || "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-fog">Videos sampled</span>
                <span className="font-mono text-snow">{report.video_count}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-fog">Engine</span>
                <span className="font-mono text-snow">v{report.engine_version}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-fog">Data source</span>
                <span className={`font-mono ${report.feed_status === "live" ? "text-mint" : "text-amber"}`}>
                  {report.feed_status === "live" ? "live" : "fallback sample"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-fog">Captions</span>
                <CoverageBadge coverage={engine.transcriptCoverage} />
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-fog">Analyzed</span>
                <span className="font-mono text-snow">
                  {new Date(report.created_at).toLocaleString()}
                </span>
              </div>
            </div>
            <a
              href={report.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost w-full !py-1.5 text-xs"
            >
              Open source on YouTube
            </a>
          </div>
          <ReportActions report={report} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="panel p-5">
            <p className="field-label mb-2">Recommendation</p>
            <p className="text-sm leading-relaxed text-fog">{recommendationFor(report)}</p>
          </div>

          <ReportVisuals factors={report.factors} videos={report.sample_videos} />

          <div className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="field-label">Integrity — seal chain</p>
              <span className={`chip ${chain.ok ? "!border-mint/40 !text-mint" : "!border-rose/40 !text-rose"}`}>
                {chain.ok ? `verified · ${chain.total} events` : `broken at #${chain.firstBrokenId}`}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-fog">
              Every create, update, and delete is appended to a SHA-384 hash chain. Replay it
              anytime on the <Link href="/verify" className="text-phosphor hover:underline">verify page</Link> or
              through the agent tool <code className="font-mono text-snow">verify_integrity</code>.
            </p>
            {auditEvents.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {auditEvents.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 font-mono text-[0.6875rem] text-fog">
                    <span>
                      #{e.id} {e.action} · {new Date(e.created_at).toLocaleTimeString()}
                    </span>
                    <span className="truncate text-phosphor/70">{e.seal.slice(0, 16)}…</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {drift && drift.points.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <DriftPanel drift={drift} />
            <OutlierList outliers={engine.outliers} meanScore={Math.round(meanVideo)} />
          </div>
        )}

        <ClaimLedger
          claims={engine.claims.claims}
          byCategory={engine.claims.byCategory}
          hedgeRatio={engine.claims.hedgeRatio}
          overclaimRatio={engine.claims.overclaimRatio}
          falsifiableRatio={engine.claims.falsifiableRatio}
          coverageLabel={engine.claims.coverageLabel}
        />
      </div>
    </div>
  );
}

function recommendationFor(report: { verdict: string; factors: { key: string; label: string; score: number }[] }): string {
  const weakest = [...report.factors].sort((a, b) => a.score - b.score)[0];
  const base: Record<string, string> = {
    trusted:
      "This channel's public record shows disciplined claims, low outrage framing, and transparent disclosure. Still verify extraordinary claims independently.",
    mostly_reliable:
      "Generally reliable record with occasional pressure tactics. Worth following, but cross-check high-stakes claims before acting on them.",
    mixed:
      "Mixed signals: some credible patterns alongside engagement-driven tactics. Consume selectively and verify anything that influences decisions.",
    low_credibility:
      "The record shows repeated absolute claims, outrage framing, or bait patterns. High risk of misinformation — do not rely on this channel for important decisions.",
  };
  const text = base[report.verdict] ?? base.mixed;
  if (weakest && weakest.score < 50 && report.verdict !== "trusted") {
    return `${text} Weakest area: ${weakest.label.toLowerCase()} (${weakest.score}/100).`;
  }
  return text;
}
