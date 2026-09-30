import { getRepository } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { CompareWorkbench } from "@/components/compare-workbench";

export const dynamic = "force-dynamic";

export const metadata = { title: "Compare channels" };

export default async function ComparePage() {
  const sessionId = await getSessionId();
  const repo = await getRepository();
  const reports = await repo.listReports(sessionId, { limit: 50 });
  const options = reports.map((r) => ({ id: r.id, title: r.channel_title, score: r.score, verdict: r.verdict }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="field-label mb-2">Head to head</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Compare channels</h1>
      <p className="mt-1 max-w-2xl text-sm text-fog">
        Put two saved reports side by side and see which factors actually drive the difference.
      </p>

      <div className="mt-8">
        {options.length < 2 ? (
          <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-sm text-snow">You need at least two reports to compare</p>
            <p className="max-w-sm text-xs text-fog">
              Analyze a couple of channels first, then come back to see how they differ factor by
              factor.
            </p>
          </div>
        ) : (
          <CompareWorkbench options={options} />
        )}
      </div>
    </div>
  );
}
