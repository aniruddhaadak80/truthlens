import type { ChannelFeed, NormalizedFeed, VideoSample } from "@/lib/types";
import { getFallbackFeed } from "./fallback";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TIMEOUT_MS = 8000;
const MAX_VIDEOS = 24;

export type ParsedInput =
  | { kind: "handle"; value: string }
  | { kind: "channel_id"; value: string }
  | { kind: "video"; value: string }
  | { kind: "invalid"; value: string };

export function parseChannelInput(raw: string): ParsedInput {
  const url = raw.trim();
  if (!url) return { kind: "invalid", value: "" };
  const vm = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?[^ ]*v=)([\w-]{6,})/i);
  if (vm) return { kind: "video", value: vm[1] };
  const cm = url.match(/youtube\.com\/(?:channel|user)\/([\w-]+)/i);
  if (cm) return { kind: "channel_id", value: cm[1] };
  const hm = url.match(/(?:youtube\.com\/@|@)([\w.-]+)/i);
  if (hm) return { kind: "handle", value: hm[1] };
  if (/^[\w.-]{2,40}$/.test(url)) return { kind: "handle", value: url };
  return { kind: "invalid", value: "" };
}

async function fetchWithTimeout(url: string, accept?: string): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      ...(accept ? { Accept: accept } : {}),
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(url, "application/json");
  return (await res.json()) as Record<string, unknown>;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, "text/html,application/xml,text/xml");
  return res.text();
}

function parseRssFeed(xml: string): ChannelFeed | null {
  const channelIdMatch = xml.match(/<yt:channelId>([^<]+)<\/yt:channelId>/);
  const linkMatch = xml.match(/<link rel="alternate" href="https:\/\/www\.youtube\.com\/channel\/([^"/]+)"/);
  const channelId = channelIdMatch?.[1] || linkMatch?.[1] || "";
  const titleMatch = xml.match(/<title>([^<]+)<\/title>/);
  const channelTitle = titleMatch ? titleMatch[1].trim() : "Unknown channel";
  const authorMatch = xml.match(/<author><name>([^<]+)<\/name>/);
  const authorName = authorMatch?.[1]?.trim() || channelTitle;

  const videos: VideoSample[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null && videos.length < MAX_VIDEOS) {
    const entry = m[1];
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || "Untitled";
    const href = entry.match(/<link rel="alternate" href="([^"]+)"/)?.[1] || "";
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || "";
    const description =
      entry.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1]?.trim() || "";
    const thumbnail = entry.match(/<media:thumbnail url="([^"]+)"/)?.[1] || "";
    const views = Number(entry.match(/<media:statistics views="(\d+)"/)?.[1] || 0);
    videos.push({
      title: decodeXmlEntities(title),
      description: decodeXmlEntities(description),
      publishedAt: published ? new Date(published).toISOString() : new Date().toISOString(),
      views,
      url: href,
      thumbnail: thumbnail || undefined,
    });
  }
  if (videos.length === 0) return null;
  return {
    channelId,
    channelTitle: decodeXmlEntities(authorName),
    channelUrl: channelId ? `https://www.youtube.com/channel/${channelId}` : "https://www.youtube.com/",
    videos,
  };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

async function resolveHandleToChannelId(handle: string): Promise<string> {
  const html = await fetchText(`https://www.youtube.com/@${encodeURIComponent(handle)}`);
  const fromFeedLink = html.match(/feeds\/videos\.xml\?channel_id=([\w-]+)/);
  if (fromFeedLink) return fromFeedLink[1];
  const fromChannelId = html.match(/"channelId":"([\w-]+)"/);
  if (fromChannelId) return fromChannelId[1];
  const fromCanonical = html.match(/youtube\.com\/channel\/([\w-]+)/);
  if (fromCanonical) return fromCanonical[1];
  throw new Error(`Could not resolve channel ID for @${handle}`);
}

async function resolveVideoToChannel(videoId: string): Promise<{ channelId: string; channelTitle: string }> {
  const data = await fetchJson(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
  );
  const authorUrl = typeof data.author_url === "string" ? data.author_url : "";
  const channelTitle = typeof data.author_name === "string" ? data.author_name : "Unknown channel";
  const cm = authorUrl.match(/youtube\.com\/(?:channel|user)\/([\w-]+)/);
  if (cm) return { channelId: cm[1], channelTitle };
  const hm = authorUrl.match(/youtube\.com\/@([\w.-]+)/);
  if (hm) {
    const channelId = await resolveHandleToChannelId(hm[1]);
    return { channelId, channelTitle };
  }
  throw new Error("Could not resolve the channel for that video URL.");
}

async function fetchRssWithRetry(channelId: string): Promise<ChannelFeed> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const xml = await fetchText(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
      );
      const feed = parseRssFeed(xml);
      if (feed) return feed;
      throw new Error("RSS feed contained no video entries.");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastError || new Error("Failed to fetch RSS feed.");
}

export async function fetchFeedFor(parsed: ParsedInput): Promise<NormalizedFeed> {
  const fetchedAt = new Date().toISOString();
  try {
    if (parsed.kind === "invalid") {
      throw new Error("Unrecognized YouTube URL or handle.");
    }
    if (parsed.kind === "channel_id") {
      const feed = await fetchRssWithRetry(parsed.value);
      return { status: "live", source: "youtube-rss", fetchedAt, channel: feed };
    }
    if (parsed.kind === "handle") {
      const channelId = await resolveHandleToChannelId(parsed.value);
      const feed = await fetchRssWithRetry(channelId);
      return { status: "live", source: "youtube-rss", fetchedAt, channel: feed };
    }
    const { channelId, channelTitle } = await resolveVideoToChannel(parsed.value);
    const feed = await fetchRssWithRetry(channelId);
    return {
      status: "live",
      source: "youtube-oembed+rss",
      fetchedAt,
      channel: { ...feed, channelTitle: feed.channelTitle || channelTitle },
    };
  } catch {
    return getFallbackFeed(parsed.value || "unknown");
  }
}
