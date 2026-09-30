import Link from "next/link";
import { getRepository } from "@/lib/db";
import { verifyLedger } from "@/lib/integrity/chain";

export const dynamic = "force-dynamic";

export const metadata = { title: "Verify integrity" };

export default async function VerifyPage() {
  const repo = await getRepository();
  const events = await repo.listAudit(undefined, undefined, 500);
  const chain = verifyLedger(events);
  const recent = events.slice(0, 12);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="field-label mb-2">Auditability</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Integrity chain</h1>
      <p className="mt-1 max-w-2xl text-sm text-fog">
        Every create, update, and delete appends an event sealed with{" "}
        <code className="font-mono text-xs text-snow">SHA-384(prevSeal ‖ canonicalJson(event))</code>.
        Replay the chain to detect any tampering. Each entity is sealed against its
        own previous event, so every report replays independently.
      </p>

      <div className="panel mt-8 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full border-2 ${
            chain.ok ? "border-mint/50 text-mint" : "border-rose/50 text-rose"
          }`}
          aria-hidden="true"
        >
          {chain.ok ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
        </span>
        <div>
          <p className="text-sm font-semibold text-snow">
            {chain.ok
              ? `All ${chain.entities} entity chain${chain.entities === 1 ? "" : "s"} verified`
              : `Chain broken at event #${chain.firstBrokenId}`}
          </p>
          <p className="mt-0.5 font-mono text-xs text-fog">
            {chain.total} events · head seal {chain.headSeal.slice(0, 24)}…
          </p>
        </div>
        <a href="/api/verify" target="_blank" rel="noopener noreferrer" className="btn-ghost ml-auto !py-1.5 text-xs">
          Raw replay
        </a>
      </div>

      <div className="panel mt-4 p-6">
        <p className="field-label mb-4">Recent audit events</p>
        {recent.length === 0 ? (
          <p className="text-xs text-fog">No audit events yet — analyze a channel to start the chain.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((e) => (
              <li key={e.id} className="panel-inset flex items-center justify-between gap-3 px-3 py-2">
                <span className="font-mono text-[0.6875rem] text-snow">
                  <span className="text-phosphor">#{e.id}</span> {e.action}{" "}
                  <span className="text-fog">{e.entity_type}</span>
                </span>
                <span className="truncate font-mono text-[0.6875rem] text-fog">{e.seal.slice(0, 20)}…</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-fog">
        Verify any single report through the{" "}
        <Link href="/agent" className="text-phosphor hover:underline">
          agent tool
        </Link>{" "}
        <code className="font-mono">verify_integrity</code>.
      </p>
    </div>
  );
}
