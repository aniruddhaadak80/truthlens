import { analyzeAndSave } from "@/lib/service";
import { getSessionId } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { fail, ok, readJson, requireString } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = checkRateLimit(`analyze:${clientIp(req.headers)}`, 12, 60_000);
  if (!rl.ok) {
    return fail(429, "rate_limited", `Too many analyses. Retry in ${rl.retryAfterSeconds}s.`);
  }
  try {
    const body = await readJson(req);
    const url = requireString(body.url, "url");
    const sessionId = await getSessionId();
    const result = await analyzeAndSave(url, sessionId);
    return ok(
      {
        report: result.report,
        engine: result.engine,
        audit: { id: result.auditId, seal: result.seal },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Analysis failed unexpectedly.");
  }
}
