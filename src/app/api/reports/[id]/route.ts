import { deleteReport, updateReportDecision } from "@/lib/service";
import { getRepository } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { fail, ok, optionalEnum, readJson, requireString } from "@/lib/api-helpers";
import { VERDICTS } from "@/lib/verdicts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const rl = checkRateLimit(`read:${clientIp(req.headers)}`, 120, 60_000);
  if (!rl.ok) return fail(429, "rate_limited", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`);
  try {
    const { id } = await ctx.params;
    const sessionId = await getSessionId();
    const repo = await getRepository();
    const report = await repo.getReport(id, sessionId);
    if (!report) return fail(404, "not_found", "Report not found.");
    return ok({ report });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not load the report.");
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const rl = checkRateLimit(`write:${clientIp(req.headers)}`, 60, 60_000);
  if (!rl.ok) return fail(429, "rate_limited", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`);
  try {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const note = body.note !== undefined ? requireString(body.note, "note", 2000) : undefined;
    const user_verdict = optionalEnum(body.user_verdict, "user_verdict", [...VERDICTS]);
    const idempotencyKey =
      body.idempotency_key !== undefined ? requireString(body.idempotency_key, "idempotency_key", 120) : undefined;
    const sessionId = await getSessionId();
    const report = await updateReportDecision(id, sessionId, { note, user_verdict }, idempotencyKey);
    return ok({ report });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not update the report.");
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const rl = checkRateLimit(`write:${clientIp(req.headers)}`, 60, 60_000);
  if (!rl.ok) return fail(429, "rate_limited", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`);
  try {
    const { id } = await ctx.params;
    const sessionId = await getSessionId();
    await deleteReport(id, sessionId);
    return ok({ deleted: true, id });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not delete the report.");
  }
}
