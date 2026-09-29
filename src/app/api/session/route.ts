import { deleteAllSessionReports } from "@/lib/service";
import { getSessionId } from "@/lib/session";
import { fail, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const sessionId = await getSessionId();
    const count = await deleteAllSessionReports(sessionId);
    return ok({ deleted: count });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not clear session data.");
  }
}
