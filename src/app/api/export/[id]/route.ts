import { getRepository } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { fail } from "@/lib/api-helpers";
import { siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const sessionId = await getSessionId();
    const repo = await getRepository();
    const report = await repo.getReport(id, sessionId);
    if (!report) return fail(404, "not_found", "Report not found.");
    const payload = {
      format: "truthlens-report/v1",
      exportedAt: new Date().toISOString(),
      generator: siteConfig.name,
      engine: { version: report.engine_version },
      channel: {
        title: report.channel_title,
        handle: report.channel_handle,
        id: report.channel_id,
        source_url: report.source_url,
      },
      feed_status: report.feed_status,
      score: report.score,
      verdict: report.verdict,
      factors: report.factors,
      signals: report.signals,
      sample_videos: report.sample_videos,
      note: report.note,
      user_verdict: report.user_verdict,
      created_at: report.created_at,
      disclaimer:
        "Scores are deterministic heuristics computed from public metadata. They are not fact-checks and do not prove intent. Verify important claims independently.",
    };
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="truthlens-${report.channel_handle || report.id}.json"`,
      },
    });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Export failed.");
  }
}
