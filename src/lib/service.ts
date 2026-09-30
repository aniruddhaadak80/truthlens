import { analyzeChannel } from "@/lib/engine/credibility";
import { getRepository } from "@/lib/db";
import { ApiError } from "@/lib/api-helpers";
import { fetchFeedFor, parseChannelInput } from "@/lib/youtube/fetch";
import { fetchTranscripts } from "@/lib/youtube/transcript";
import { verifyChain } from "@/lib/integrity/chain";
import { DEFAULT_WEIGHTS, FACTOR_LABELS, type EngineResult, type ReportRow } from "@/lib/types";
import type { Comparison, DriftReport } from "@/lib/db/repository";

export interface AnalyzeResult {
  report: ReportRow;
  engine: EngineResult;
  auditId: number;
  seal: string;
}

export interface AnalyzeOptions {
  withTranscripts?: boolean;
}

export async function analyzeAndSave(
  rawUrl: string,
  sessionId: string,
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
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

  const transcripts =
    options.withTranscripts === false
      ? {}
      : await fetchTranscripts(feed.channel.videos);

  const engine = analyzeChannel(
    { channelTitle: feed.channel.channelTitle, videos: feed.channel.videos, transcripts },
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
  await recordSnapshot(repo, report, engine);
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
      transcript_coverage: engine.transcriptCoverage.status,
      transcript_words: engine.transcriptCoverage.totalWords,
      claim_count: engine.claims.claims.length,
      notice: feed.notice ?? null,
    },
  });
  return { report, engine, auditId: audit.id, seal: audit.seal };
}

async function recordSnapshot(
  repo: Awaited<ReturnType<typeof getRepository>>,
  report: ReportRow,
  engine: EngineResult,
): Promise<void> {
  if (!report.channel_id) return;
  const factorScores: Record<string, number> = {};
  for (const f of engine.factors) factorScores[f.key] = f.score;
  try {
    await repo.recordSnapshot({
      id: crypto.randomUUID(),
      channel_id: report.channel_id,
      channel_title: report.channel_title,
      engine_version: engine.version,
      score: engine.score,
      verdict: engine.verdict,
      factor_scores: factorScores,
      transcript_coverage: engine.transcriptCoverage.status,
    });
  } catch {
    // Drift history is an enhancement; a write failure must not fail the analysis.
  }
}

export async function getDrift(channelId: string): Promise<DriftReport> {
  if (!channelId) {
    throw new ApiError(400, "invalid_field", "A channel id is required to read drift.");
  }
  const repo = await getRepository();
  const rows = await repo.listSnapshots(channelId, 30);
  if (rows.length === 0) {
    return {
      channelId,
      channelTitle: "",
      points: [],
      current: null,
      previous: null,
      delta: null,
      direction: "unknown",
      biggestMover: null,
      summary: "No history for this channel yet. Analyze it again later to see how the score moves.",
    };
  }

  const points = rows.map((r) => ({
    analyzedAt: r.analyzed_at,
    score: r.score,
    verdict: r.verdict,
    factorScores: r.factor_scores ?? {},
    transcriptCoverage: r.transcript_coverage,
    engineVersion: r.engine_version,
  }));
  const current = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const delta = previous ? current.score - previous.score : null;
  const direction: DriftReport["direction"] =
    delta === null ? "unknown" : delta > 2 ? "rising" : delta < -2 ? "falling" : "stable";

  let biggestMover: DriftReport["biggestMover"] = null;
  if (previous) {
    for (const [key, value] of Object.entries(current.factorScores)) {
      const before = previous.factorScores[key];
      if (typeof before !== "number") continue;
      const d = value - before;
      if (!biggestMover || Math.abs(d) > Math.abs(biggestMover.delta)) {
        biggestMover = { key, delta: d };
      }
    }
  }

  const summary =
    delta === null
      ? `First reading: ${current.score}/100 (${current.verdict}). Run another analysis later to detect drift.`
      : direction === "stable"
        ? `Holding steady at ${current.score}/100 across ${points.length} readings.`
        : `${current.score}/100, ${direction === "rising" ? "up" : "down"} ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"} since the last reading${
            biggestMover
              ? `, mostly from ${FACTOR_LABELS[biggestMover.key as keyof typeof FACTOR_LABELS]?.toLowerCase() ?? biggestMover.key} (${biggestMover.delta > 0 ? "+" : ""}${biggestMover.delta})`
              : ""
          }.`;

  return {
    channelId,
    channelTitle: rows[0].channel_title,
    points,
    current: current.score,
    previous: previous ? previous.score : null,
    delta,
    direction,
    biggestMover,
    summary,
  };
}

export async function compareReports(
  leftId: string,
  rightId: string,
  sessionId: string,
): Promise<Comparison> {
  const repo = await getRepository();
  const left = await repo.getReport(leftId, sessionId);
  const right = await repo.getReport(rightId, sessionId);
  if (!left) throw new ApiError(404, "not_found", "Left report not found.");
  if (!right) throw new ApiError(404, "not_found", "Right report not found.");
  if (left.id === right.id) {
    throw new ApiError(400, "invalid_field", "Choose two different reports to compare.");
  }

  const toFactorMap = (r: ReportRow) => {
    const m: Record<string, number> = {};
    for (const f of r.factors) m[f.key] = f.score;
    return m;
  };
  const lf = toFactorMap(left);
  const rf = toFactorMap(right);

  const factorGaps = Object.keys({ ...lf, ...rf })
    .map((key) => ({
      key,
      label: FACTOR_LABELS[key as keyof typeof FACTOR_LABELS] ?? key,
      delta: (lf[key] ?? 50) - (rf[key] ?? 50),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const scoreGap = left.score - right.score;
  const winner: Comparison["winner"] = Math.abs(scoreGap) <= 2 ? "tie" : scoreGap > 0 ? "left" : "right";
  const leader = winner === "left" ? left : winner === "right" ? right : null;
  const strongest = factorGaps[0];
  const summary =
    winner === "tie"
      ? `${left.channel_title} and ${right.channel_title} are within ${Math.abs(scoreGap)} points — treat them as equivalent on these signals.`
      : `${leader!.channel_title} leads by ${Math.abs(scoreGap)} points (${
          strongest && Math.abs(strongest.delta) >= 5
            ? `biggest gap: ${strongest.label.toLowerCase()} (${strongest.delta > 0 ? "+" : ""}${strongest.delta})`
            : "no single dominant factor"
        }).`;

  await repo.createComparison({
    id: crypto.randomUUID(),
    session_id: sessionId,
    left_report_id: left.id,
    right_report_id: right.id,
    verdict: winner,
    rationale: summary,
  });
  await repo.appendAudit({
    session_id: sessionId,
    entity_type: "comparison",
    entity_id: `${left.id}:${right.id}`,
    action: "compare",
    payload: { left: left.score, right: right.score, winner, score_gap: scoreGap },
  });

  return {
    left: { id: left.id, title: left.channel_title, score: left.score, verdict: left.verdict, factors: lf },
    right: { id: right.id, title: right.channel_title, score: right.score, verdict: right.verdict, factors: rf },
    winner,
    scoreGap,
    factorGaps,
    summary,
  };
}


export async function reanalyzeReport(id: string, sessionId: string): Promise<AnalyzeResult> {
  const repo = await getRepository();
  const existing = await repo.getReport(id, sessionId);
  if (!existing) throw new ApiError(404, "not_found", "Report not found.");
  const settings = await repo.getSettings(sessionId);
  const weights = settings ? { ...DEFAULT_WEIGHTS, ...settings } : DEFAULT_WEIGHTS;
  const parsed = parseChannelInput(existing.source_url);
  const feed = await fetchFeedFor(
    parsed.kind === "invalid"
      ? { kind: "handle", value: existing.channel_handle.replace(/^@/, "") || existing.channel_id }
      : parsed,
  );
  const transcripts = await fetchTranscripts(feed.channel.videos);
  const engine = analyzeChannel(
    { channelTitle: feed.channel.channelTitle, videos: feed.channel.videos, transcripts },
    weights,
  );

  // Persist the refreshed result so the report reflects the new engine output.
  const updated = await repo.updateReportWithAnalysis(
    id,
    sessionId,
    {
      engine_version: engine.version,
      score: engine.score,
      verdict: engine.verdict,
      factors: engine.factors,
      signals: engine.signals,
      sample_videos: feed.channel.videos.slice(0, 12),
      feed_status: feed.status,
      video_count: engine.videoCount,
    },
  );
  if (!updated) throw new ApiError(404, "not_found", "Report not found.");
  await recordSnapshot(repo, updated, engine);
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
      transcript_coverage: engine.transcriptCoverage.status,
    },
  });
  return { report: updated, engine, auditId: 0, seal: "" };
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
