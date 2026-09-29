import Link from "next/link";
import { getRepository } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { ReportsWorkspace } from "@/components/reports-workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const sessionId = await getSessionId();
  const repo = await getRepository();
  const reports = await repo.listReports(sessionId, { limit: 100 });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="field-label mb-2">Workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your reports</h1>
          <p className="mt-1 text-sm text-fog">
            Saved to this browser session. Every report is sealed into the integrity chain.
          </p>
        </div>
        <Link href="/" className="btn-primary">
          New analysis
        </Link>
      </div>
      <div className="mt-8">
        <ReportsWorkspace initialReports={reports} />
      </div>
    </div>
  );
}
