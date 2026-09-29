import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepository } from "@/lib/db";
import { ScoreGauge } from "@/components/score-gauge";
import { VerdictBadge } from "@/components/verdict-badge";
import { siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const report = await repo.getReport(id);
  if (!report || report.deleted_at) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="panel p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <ScoreGauge score={report.score} size={140} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{report.channel_title}</h1>
            <p className="mt-1 font-mono text-xs text-fog">
              {report.channel_handle || report.channel_id} · {report.video_count} videos sampled
            </p>
          </div>
          <VerdictBadge verdict={report.verdict} />
        </div>

        <div className="mt-8 border-t border-line pt-6">
          <p className="field-label mb-3">Factor scores</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {report.factors.map((f) => (
              <li key={f.key} className="panel-inset flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-snow">{f.label}</span>
                <span className="font-mono text-xs text-phosphor">{f.score}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 border-t border-line pt-6 text-center">
          <p className="font-mono text-[0.6875rem] text-fog">
            engine v{report.engine_version} · {report.feed_status === "live" ? "live data" : "fallback sample"} ·{" "}
            {new Date(report.created_at).toLocaleString()}
          </p>
          <p className="mx-auto mt-3 max-w-md text-[0.6875rem] leading-relaxed text-fog">
            Scores are deterministic heuristics computed from public metadata. They are not
            fact-checks and do not prove intent. Verify important claims independently.
          </p>
          <Link href="/" className="btn-primary mt-6">
            Analyze your own channels
          </Link>
          <p className="mt-3 font-mono text-[0.6875rem] text-fog">
            {siteConfig.name} — {siteConfig.repoUrl}
          </p>
        </div>
      </div>
    </div>
  );
}
