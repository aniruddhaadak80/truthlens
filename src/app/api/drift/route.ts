import { getDrift } from "@/lib/service";
import { getRepository } from "@/lib/db";
import { fail, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const channelId = params.get("channel") ?? "";
    if (!channelId) {
      const reportId = params.get("report") ?? "";
      if (!reportId) {
        return fail(400, "invalid_field", 'Provide "channel" or "report" to read drift.');
      }
      const repo = await getRepository();
      const report = await repo.getReport(reportId);
      if (!report) return fail(404, "not_found", "Report not found.");
      return ok(await getDrift(report.channel_id));
    }
    return ok(await getDrift(channelId));
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not read drift history.");
  }
}
