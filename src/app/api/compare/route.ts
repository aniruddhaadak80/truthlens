import { compareReports } from "@/lib/service";
import { getSessionId } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { fail, ok, readJson, requireString } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = checkRateLimit(`compare:${clientIp(req.headers)}`, 60, 60_000);
  if (!rl.ok) return fail(429, "rate_limited", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`);
  try {
    const body = await readJson(req);
    const left = requireString(body.left_id, "left_id", 100);
    const right = requireString(body.right_id, "right_id", 100);
    const sessionId = await getSessionId();
    return ok(await compareReports(left, right, sessionId));
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not compare the reports.");
  }
}
