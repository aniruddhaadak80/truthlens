import { getRepository } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = checkRateLimit(`read:${clientIp(req.headers)}`, 120, 60_000);
  if (!rl.ok) {
    return fail(429, "rate_limited", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`);
  }
  try {
    const sessionId = await getSessionId();
    const repo = await getRepository();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
    const reports = await repo.listReports(sessionId, { limit, offset });
    const total = await repo.countReports(sessionId);
    return ok({ reports, total, limit, offset });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not load reports.");
  }
}
