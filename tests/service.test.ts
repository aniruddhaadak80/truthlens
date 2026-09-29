import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "truthlens-test-"));
process.env.PGLITE_DIR = tmpDir;
delete process.env.DATABASE_URL;
process.env.YOUTUBE_TIMEOUT_MS = "1200";

const { getRepository } = await import("@/lib/db");
const service = await import("@/lib/service");

const SESSION = "11111111-1111-4111-8111-111111111111";
const OTHER_SESSION = "22222222-2222-4222-8222-222222222222";

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw";
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>Deterministic Test Channel</title>
  <entry>
    <yt:videoId>vid0000001</yt:videoId>
    <yt:channelId>${CHANNEL_ID}</yt:channelId>
    <link rel="alternate" href="https://www.youtube.com/watch?v=vid0000001"/>
    <title>How bridges stay standing: a clear look at load paths</title>
    <author><name>Deterministic Test Channel</name></author>
    <published>2026-09-01T10:00:00+00:00</published>
    <media:group>
      <media:description>We walk through the published engineering data and cite the structural reports.</media:description>
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
      <media:description>We read the primary paper and explain what the data supports. References in the pinned comment.</media:description>
      <media:thumbnail url="https://i.ytimg.com/vi/vid0000002/hqdefault.jpg"/>
      <media:community><media:statistics views="88000"/></media:community>
    </media:group>
  </entry>
  <entry>
    <yt:videoId>vid0000003</yt:videoId>
    <yt:channelId>${CHANNEL_ID}</yt:channelId>
    <link rel="alternate" href="https://www.youtube.com/watch?v=vid0000003"/>
    <title>A reproducible method for measuring small oscillations</title>
    <author><name>Deterministic Test Channel</name></author>
    <published>2026-08-19T10:00:00+00:00</published>
    <media:group>
      <media:description>Full protocol and dataset are linked below. Sponsored segment clearly disclosed.</media:description>
      <media:thumbnail url="https://i.ytimg.com/vi/vid0000003/hqdefault.jpg"/>
      <media:community><media:statistics views="64000"/></media:community>
    </media:group>
  </entry>
</feed>`;

const realFetch = globalThis.fetch;

beforeAll(() => {
  // Serve a deterministic public-feed shape so this suite exercises the real
  // normalization, engine, persistence, and audit paths without depending on
  // third-party network availability.
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

describe("service layer integration", () => {
  it("rejects invalid URLs", async () => {
    await expect(service.analyzeAndSave("not a url at all", SESSION)).rejects.toMatchObject({
      status: 400,
      code: "invalid_url",
    });
  });

  it("analyzes, persists, reads back, updates, verifies, and deletes", async () => {
    const { report, engine, seal } = await service.analyzeAndSave(
      "https://www.youtube.com/@veritasium",
      SESSION,
    );
    expect(report.id).toBeTruthy();
    expect(engine.score).toBe(report.score);
    expect(seal).toHaveLength(96);
    expect(report.feed_status).toBe("live");
    expect(report.channel_id).toBe(CHANNEL_ID);
    expect(report.video_count).toBe(3);

    const repo = await getRepository();
    const readBack = await repo.getReport(report.id, SESSION);
    expect(readBack).not.toBeNull();
    expect(readBack!.channel_title).toBe(report.channel_title);

    const otherSession = await repo.getReport(report.id, OTHER_SESSION);
    expect(otherSession).toBeNull();

    const updated = await service.updateReportDecision(
      report.id,
      SESSION,
      { note: "Great science communication", user_verdict: "trusted" },
      "idem-key-1",
    );
    expect(updated.note).toBe("Great science communication");
    expect(updated.user_verdict).toBe("trusted");

    const again = await service.updateReportDecision(
      report.id,
      SESSION,
      { note: "Great science communication", user_verdict: "trusted" },
      "idem-key-1",
    );
    expect(again.id).toBe(updated.id);

    const chain = await service.verifyIntegrity(report.id);
    expect(chain.ok).toBe(true);
    expect(chain.total).toBe(2);

    await service.deleteReport(report.id, SESSION);
    const afterDelete = await repo.getReport(report.id, SESSION);
    expect(afterDelete).toBeNull();

    const chainAfterDelete = await service.verifyIntegrity(report.id);
    expect(chainAfterDelete.ok).toBe(true);
    expect(chainAfterDelete.total).toBe(3);
  });

  it("persists session weights", async () => {
    const weights = await service.saveSessionWeights(SESSION, {
      claim_discipline: 0.4,
      controversy_temperature: 0.2,
      clickbait_pressure: 0.1,
      sentiment_balance: 0.1,
      cadence_consistency: 0.1,
      transparency: 0.1,
    });
    expect(weights.claim_discipline).toBe(0.4);
    const loaded = await service.getSessionWeights(SESSION);
    expect(loaded.claim_discipline).toBe(0.4);
  });

  it("soft-deletes all session reports", async () => {
    await service.analyzeAndSave("https://www.youtube.com/@kurzgesagt", SESSION);
    const count = await service.deleteAllSessionReports(SESSION);
    expect(count).toBeGreaterThanOrEqual(1);
    const repo = await getRepository();
    expect(await repo.countReports(SESSION)).toBe(0);
  });
});
