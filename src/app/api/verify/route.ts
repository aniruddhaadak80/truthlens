import { verifyIntegrity } from "@/lib/service";
import { fail, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const entity = new URL(req.url).searchParams.get("entity") ?? undefined;
    const result = await verifyIntegrity(entity || undefined);
    return ok(result);
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Integrity replay failed.");
  }
}
