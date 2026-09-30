import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "truthlens-drift-"));
process.env.PGLITE_DIR = tmpDir;
delete process.env.DATABASE_URL;
process.env.YOUTUBE_TIMEOUT_MS = "800";

const service = await import("@/lib/service");

const SESSION = "33333333-3333-4333-8333-333333333333";
const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <yt:videoId>vid0000001</yt:videoId>
    <yt:channelId>${CHANNEL_ID}</yt:channelId>
    <link rel="alternate" href="https://www.youtube.com/watch?v=vid0000001"/>
    <title>How bridges stay standing: a clear look at load paths</title>
    <author><name>Deterministic Test Channel</name></author>
    <published>2026-09-01T10:00:00+00:00</published>
    <media:group>
      <media:description>We walk through the published engineering data and cite the structural reports. Sources below.</media:description>
      <media:thumbnail url="https://i.ytimg.com/vi/vid0000001/hqdefault.jpg"/>
      <media:community><media:statistics views="120000"/></media:community>
    </media:group>
  </entry>
  <entry>
    <yt:videoId>vid0000002</yt:videoId>
    <yt:channelId>${CHANNEL_ID}</yt:channelId>
    <link rel="alternate" href="https://www.youtube.com/watch?v=vid0000002"/>
    <title>What the new telescope images actually show</title>
    <author><name>Deterministic Test Channel</name></author>
    <published>2026-08-25T10:00:00+00:00</published>
    <media:group>
      <media:description>We read the primary paper and explain what the data supports. References pinned.</media:description>
      <media:thumbnail url="https://i.ytimg.com/vi/vid0000002/hqdefault.jpg"/>
      <media:community><media:statistics views="88000"/></media:community>
    </media:group>
  </entry>
</feed>`;

const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("youtube.com/feeds/videos.xml")) {
      return new Response(RSS, { status: 200, headers: { "Content-Type": "application/xml" } });
    }
    if (url.includes("youtube.com/@")) {
      return new Response(
        `<html><link rel="alternate" href="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}"></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("drift and comparison", () => {
  it("returns an honest empty result for an unknown channel", async () => {
    const drift = await service.getDrift("UC-does-not-exist");
    expect(drift.points).toHaveLength(0);
    expect(drift.direction).toBe("unknown");
    expect(drift.summary).toContain("No history");
  });

  it("records a snapshot on analyze and reads it back", async () => {
    const { report } = await service.analyzeAndSave(
      "https://www.youtube.com/@deterministic-test",
      SESSION,
    );
    expect(report.channel_id).toBe(CHANNEL_ID);

    const drift = await service.getDrift(CHANNEL_ID);
    expect(drift.points.length).toBeGreaterThanOrEqual(1);
    expect(drift.current).toBe(report.score);
    expect(drift.delta).toBeNull();
    expect(drift.direction).toBe("unknown");
  });

  it("detects drift after a second reading", async () => {
    const { report } = await service.analyzeAndSave("https://www.youtube.com/@drift-test", SESSION);
    const before = (await service.getDrift(CHANNEL_ID)).points.length;
    await service.reanalyzeReport(report.id, SESSION);
    const drift = await service.getDrift(CHANNEL_ID);
    expect(drift.points.length).toBe(before + 1);
    expect(drift.delta).toBe(0);
    expect(["stable", "unknown"]).toContain(drift.direction);
  });

  it("persists the refreshed engine result on re-analysis", async () => {
    const { report } = await service.analyzeAndSave("https://www.youtube.com/@refresh-test", SESSION);
    const result = await service.reanalyzeReport(report.id, SESSION);
    expect(result.report.engine_version).toBe("2026.2.0");
    expect(result.report.factors).toHaveLength(8);
    expect(result.engine.claims).toBeDefined();
    expect(result.engine.transcriptCoverage).toBeDefined();
  });

  it("compares two reports factor by factor", async () => {
    const a = await service.analyzeAndSave("https://www.youtube.com/@compare-a", SESSION);
    const b = await service.analyzeAndSave("https://www.youtube.com/@compare-b", SESSION);

    const comparison = await service.compareReports(a.report.id, b.report.id, SESSION);
    expect(["left", "right", "tie"]).toContain(comparison.winner);
    expect(comparison.factorGaps.length).toBe(8);
    expect(typeof comparison.summary).toBe("string");
    expect(comparison.left.id).toBe(a.report.id);
    expect(comparison.right.id).toBe(b.report.id);
  });

  it("refuses to compare a report with itself", async () => {
    const a = await service.analyzeAndSave("https://www.youtube.com/@self-compare", SESSION);
    await expect(service.compareReports(a.report.id, a.report.id, SESSION)).rejects.toMatchObject({
      code: "invalid_field",
    });
  });

  it("refuses to compare a report from another session", async () => {
    const a = await service.analyzeAndSave("https://www.youtube.com/@other-session", SESSION);
    await expect(
      service.compareReports(a.report.id, "22222222-2222-4222-8222-222222222222", SESSION),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
