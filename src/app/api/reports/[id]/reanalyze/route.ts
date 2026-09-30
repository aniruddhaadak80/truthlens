import { reanalyzeReport } from "@/lib/service";
import { getSessionId } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Re-run the engine on a saved report and record a new drift snapshot. */
export async function POST(req: Request, ctx: Ctx) {
  const rl = checkRateLimit(`reanalyze:${clientIp(req.headers)}`, 12, 60_000);
  if (!rl.ok) return fail(429, "rate_limited", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`);
  try {
    const { id } = await ctx.params;
    const sessionId = await getSessionId();
    const result = await reanalyzeReport(id, sessionId);
    return ok({ report: result.report, engine: result.engine });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not re-analyze the report.");
  }
}
