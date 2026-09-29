import { fetchFeedFor, parseChannelInput } from "@/lib/youtube/fetch";
import { fail, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url).searchParams.get("url") ?? "";
    const trimmed = url.trim();
    if (!trimmed) return fail(400, "invalid_field", 'Query parameter "url" is required.');
    const parsed = parseChannelInput(trimmed);
    if (parsed.kind === "invalid") {
      return fail(400, "invalid_url", "That does not look like a YouTube channel or video link.");
    }
    const feed = await fetchFeedFor(parsed);
    return ok({
      status: feed.status,
      source: feed.source,
      fetchedAt: feed.fetchedAt,
      notice: feed.notice ?? null,
      channel: feed.channel,
    });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(500, "internal", "Could not fetch the feed.");
  }
}
