import { analyzeChannel } from "@/lib/engine/credibility";
import { getRepository } from "@/lib/db";
import { ApiError } from "@/lib/api-helpers";
import { fetchFeedFor, parseChannelInput } from "@/lib/youtube/fetch";
import { verifyChain } from "@/lib/integrity/chain";
import { DEFAULT_WEIGHTS, type EngineResult, type ReportRow } from "@/lib/types";

export interface AnalyzeResult {
  report: ReportRow;
  engine: EngineResult;
  auditId: number;
  seal: string;
}

export async function analyzeAndSave(rawUrl: string, sessionId: string): Promise<AnalyzeResult> {
  const parsed = parseChannelInput(rawUrl);
  if (parsed.kind === "invalid") {
    throw new ApiError(
      400,
      "invalid_url",
      "That does not look like a YouTube channel or video link. Try a URL like https://www.youtube.com/@handle",
    );
  }
  const repo = await getRepository();
  const settings = await repo.getSettings(sessionId);
  const weights = settings ? { ...DEFAULT_WEIGHTS, ...settings } : DEFAULT_WEIGHTS;
  const feed = await fetchFeedFor(parsed);
  const engine = analyzeChannel(
    { channelTitle: feed.channel.channelTitle, videos: feed.channel.videos },
    weights,
  );
  const id = crypto.randomUUID();
  const report = await repo.createReport({
    id,
    session_id: sessionId,
    channel_title: feed.channel.channelTitle,
    channel_handle: parsed.kind === "handle" ? `@${parsed.value}` : "",
    channel_id: feed.channel.channelId,
    source_url: rawUrl,
    video_count: engine.videoCount,
    engine_version: engine.version,
    score: engine.score,
    verdict: engine.verdict,
    factors: engine.factors,
    signals: engine.signals,
    sample_videos: feed.channel.videos.slice(0, 12),
    feed_status: feed.status,
  });
  const audit = await repo.appendAudit({
    session_id: sessionId,
    entity_type: "report",
    entity_id: id,
    action: "create",
    payload: {
      source_url: rawUrl,
      feed_status: feed.status,
      score: engine.score,
      verdict: engine.verdict,
      engine_version: engine.version,
      notice: feed.notice ?? null,
    },
  });
  return { report, engine, auditId: audit.id, seal: audit.seal };
}

export async function reanalyzeReport(id: string, sessionId: string): Promise<AnalyzeResult> {
  const repo = await getRepository();
  const existing = await repo.getReport(id, sessionId);
  if (!existing) throw new ApiError(404, "not_found", "Report not found.");
  const settings = await repo.getSettings(sessionId);
  const weights = settings ? { ...DEFAULT_WEIGHTS, ...settings } : DEFAULT_WEIGHTS;
  const parsed = parseChannelInput(existing.source_url);
  const feed = await fetchFeedFor(parsed.kind === "invalid" ? { kind: "handle", value: existing.channel_handle.replace(/^@/, "") || existing.channel_id } : parsed);
  const engine = analyzeChannel(
    { channelTitle: feed.channel.channelTitle, videos: feed.channel.videos },
    weights,
  );
  const updated = await repo.updateReport(id, sessionId, {});
  if (!updated) throw new ApiError(404, "not_found", "Report not found.");
  await repo.appendAudit({
    session_id: sessionId,
    entity_type: "report",
    entity_id: id,
    action: "reanalyze",
    payload: {
      feed_status: feed.status,
      score: engine.score,
      verdict: engine.verdict,
      engine_version: engine.version,
      previous_score: existing.score,
    },
  });
  const fresh = await repo.getReport(id, sessionId);
  return { report: fresh!, engine, auditId: 0, seal: "" };
}

export async function updateReportDecision(
  id: string,
  sessionId: string,
  patch: { note?: string; user_verdict?: string },
  idempotencyKey?: string,
): Promise<ReportRow> {
  const repo = await getRepository();
  if (idempotencyKey) {
    const prior = await repo.findAuditByIdempotencyKey(idempotencyKey);
    if (prior) {
      const stored = prior.payload.result as ReportRow | undefined;
      if (stored) return stored;
    }
  }
  const existing = await repo.getReport(id, sessionId);
  if (!existing) throw new ApiError(404, "not_found", "Report not found.");
  const updated = await repo.updateReport(id, sessionId, patch);
  if (!updated) throw new ApiError(404, "not_found", "Report not found.");
  await repo.appendAudit({
    session_id: sessionId,
    entity_type: "report",
    entity_id: id,
    action: "update",
    payload: {
      ...patch,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey, result: updated } : {}),
    },
  });
  return updated;
}

export async function deleteReport(id: string, sessionId: string): Promise<void> {
  const repo = await getRepository();
  const existing = await repo.getReport(id, sessionId);
  if (!existing) throw new ApiError(404, "not_found", "Report not found.");
  const deleted = await repo.deleteReport(id, sessionId);
  if (!deleted) throw new ApiError(409, "conflict", "Report was already deleted.");
  await repo.appendAudit({
    session_id: sessionId,
    entity_type: "report",
    entity_id: id,
    action: "delete",
    payload: { channel_title: existing.channel_title, score: existing.score },
  });
}

export async function verifyIntegrity(entityId?: string): Promise<{
  ok: boolean;
  total: number;
  firstBrokenId: number | null;
  headSeal: string;
  entityId?: string;
}> {
  const repo = await getRepository();
  const events = await repo.listAudit(entityId ? "report" : undefined, entityId, 500);
  const result = verifyChain(events);
  return { ...result, entityId };
}

export async function getSessionWeights(sessionId: string): Promise<Record<string, number>> {
  const repo = await getRepository();
  const settings = await repo.getSettings(sessionId);
  return settings ? { ...DEFAULT_WEIGHTS, ...settings } : { ...DEFAULT_WEIGHTS };
}

export async function saveSessionWeights(
  sessionId: string,
  weights: Record<string, number>,
): Promise<Record<string, number>> {
  const repo = await getRepository();
  const merged = { ...DEFAULT_WEIGHTS, ...weights };
  await repo.saveSettings(sessionId, merged);
  await repo.appendAudit({
    session_id: sessionId,
    entity_type: "settings",
    entity_id: sessionId,
    action: "update_weights",
    payload: { weights: merged },
  });
  return merged;
}

export async function deleteAllSessionReports(sessionId: string): Promise<number> {
  const repo = await getRepository();
  const count = await repo.deleteAllReports(sessionId);
  await repo.appendAudit({
    session_id: sessionId,
    entity_type: "session",
    entity_id: sessionId,
    action: "delete_all",
    payload: { deleted_count: count },
  });
  return count;
}
