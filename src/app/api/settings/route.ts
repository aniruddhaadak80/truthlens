import { getSessionWeights, saveSessionWeights } from "@/lib/service";
import { getSessionId } from "@/lib/session";
import { fail, ok, readJson } from "@/lib/api-helpers";
import { DEFAULT_WEIGHTS } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionId = await getSessionId();
    const weights = await getSessionWeights(sessionId);
    return ok({ weights });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not load settings.");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await readJson(req);
    const incoming = (body.weights ?? {}) as Record<string, unknown>;
    const weights: Record<string, number> = { ...DEFAULT_WEIGHTS };
    for (const key of Object.keys(DEFAULT_WEIGHTS)) {
      const v = incoming[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        weights[key] = Math.min(Math.max(v, 0), 1);
      }
    }
    const sessionId = await getSessionId();
    const saved = await saveSessionWeights(sessionId, weights);
    return ok({ weights: saved });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not save settings.");
  }
}
