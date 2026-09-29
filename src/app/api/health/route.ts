import { getRepository } from "@/lib/db";
import { ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repo = await getRepository();
    const dbUp = await repo.ping();
    const total = dbUp ? await repo.countAllReports() : 0;
    return ok({
      ok: true,
      store: repo.kind === "pg" ? "neon-postgres" : "pglite-local",
      checks: {
        database: dbUp ? "up" : "down",
        reports_persisted: total,
      },
      time: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        store: process.env.DATABASE_URL ? "neon-postgres" : "unconfigured",
        checks: { database: "down" },
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 },
    );
  }
}
