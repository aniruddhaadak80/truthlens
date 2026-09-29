import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, describe, expect, it } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "truthlens-test-"));
process.env.PGLITE_DIR = tmpDir;
delete process.env.DATABASE_URL;

const { getRepository } = await import("@/lib/db");
const service = await import("@/lib/service");

const SESSION = "11111111-1111-4111-8111-111111111111";
const OTHER_SESSION = "22222222-2222-4222-8222-222222222222";

afterAll(() => {
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
    expect(["live", "fallback"]).toContain(report.feed_status);

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
