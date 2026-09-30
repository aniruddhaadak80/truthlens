import { analyzeChannel } from "@/lib/engine/credibility";
import { parseChannelInput } from "@/lib/youtube/fetch";
import { fetchFeedFor } from "@/lib/youtube/fetch";
import { fetchTranscripts } from "@/lib/youtube/transcript";
import { fail, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Ad-hoc claim extraction for a channel, without persisting a report. This is
 * the "what is this person actually asserting?" view.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url).searchParams.get("url") ?? "";
    if (!url.trim()) return fail(400, "invalid_field", 'Query parameter "url" is required.');
    const parsed = parseChannelInput(url.trim());
    if (parsed.kind === "invalid") {
      return fail(400, "invalid_url", "That does not look like a YouTube channel or video link.");
    }
    const feed = await fetchFeedFor(parsed);
    const transcripts = await fetchTranscripts(feed.channel.videos);
    const engine = analyzeChannel({
      channelTitle: feed.channel.channelTitle,
      videos: feed.channel.videos,
      transcripts,
    });
    return ok({
      channel: feed.channel.channelTitle,
      feed_status: feed.status,
      transcript_coverage: engine.transcriptCoverage,
      coverage_label: engine.claims.coverageLabel,
      analyzed_units: engine.claims.analyzedUnits,
      by_category: engine.claims.byCategory,
      hedge_ratio: engine.claims.hedgeRatio,
      overclaim_ratio: engine.claims.overclaimRatio,
      falsifiable_ratio: engine.claims.falsifiableRatio,
      claims: engine.claims.claims,
    });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not extract claims.");
  }
}
