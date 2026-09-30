import type { AuditEventInput, AuditRow, ReportRow } from "@/lib/types";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  channel_handle TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  video_count INTEGER NOT NULL DEFAULT 0,
  engine_version TEXT NOT NULL,
  score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_videos JSONB NOT NULL DEFAULT '[]'::jsonb,
  feed_status TEXT NOT NULL DEFAULT 'fallback',
  note TEXT NOT NULL DEFAULT '',
  user_verdict TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reports_session ON reports(session_id, deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_channel ON reports(channel_id, created_at DESC);
CREATE TABLE IF NOT EXISTS channel_snapshots (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  factor_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  transcript_coverage TEXT NOT NULL DEFAULT 'titles-only',
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_channel ON channel_snapshots(channel_id, analyzed_at DESC);
CREATE TABLE IF NOT EXISTS comparisons (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  left_report_id TEXT NOT NULL,
  right_report_id TEXT NOT NULL,
  verdict TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comparisons_session ON comparisons(session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  seal TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id, id);
CREATE TABLE IF NOT EXISTS settings (
  session_id TEXT PRIMARY KEY,
  weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export interface NewReport {
  id: string;
  session_id: string;
  channel_title: string;
  channel_handle: string;
  channel_id: string;
  source_url: string;
  video_count: number;
  engine_version: string;
  score: number;
  verdict: string;
  factors: ReportRow["factors"];
  signals: ReportRow["signals"];
  sample_videos: ReportRow["sample_videos"];
  feed_status: ReportRow["feed_status"];
}

export interface ReportListOptions {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export interface SnapshotInput {
  id: string;
  channel_id: string;
  channel_title: string;
  engine_version: string;
  score: number;
  verdict: string;
  factor_scores: Record<string, number>;
  transcript_coverage: string;
}

export interface SnapshotRow {
  id: string;
  channel_id: string;
  channel_title: string;
  engine_version: string;
  score: number;
  verdict: string;
  factor_scores: Record<string, number>;
  transcript_coverage: string;
  analyzed_at: string;
}

export interface ComparisonRow {
  id: string;
  session_id: string;
  left_report_id: string;
  right_report_id: string;
  verdict: string;
  rationale: string;
  created_at: string;
}

export interface DriftPoint {
  analyzedAt: string;
  score: number;
  verdict: string;
  factorScores: Record<string, number>;
  transcriptCoverage: string;
  engineVersion: string;
}

export interface DriftReport {
  channelId: string;
  channelTitle: string;
  points: DriftPoint[];
  current: number | null;
  previous: number | null;
  delta: number | null;
  direction: "rising" | "falling" | "stable" | "unknown";
  biggestMover: { key: string; delta: number } | null;
  summary: string;
}

export interface Comparison {
  left: { id: string; title: string; score: number; verdict: string; factors: Record<string, number> };
  right: { id: string; title: string; score: number; verdict: string; factors: Record<string, number> };
  winner: "left" | "right" | "tie";
  scoreGap: number;
  factorGaps: { key: string; label: string; delta: number }[];
  summary: string;
}


export interface Repository {
  readonly kind: "pglite" | "pg";
  init(): Promise<void>;
  createReport(r: NewReport): Promise<ReportRow>;
  getReport(id: string, sessionId?: string): Promise<ReportRow | null>;
  listReports(sessionId: string, opts?: ReportListOptions): Promise<ReportRow[]>;
  listRecentReports(limit: number): Promise<ReportRow[]>;
  updateReport(
    id: string,
    sessionId: string,
    patch: { note?: string; user_verdict?: string },
  ): Promise<ReportRow | null>;
  updateReportWithAnalysis(
    id: string,
    sessionId: string,
    patch: {
      engine_version: string;
      score: number;
      verdict: string;
      factors: ReportRow["factors"];
      signals: ReportRow["signals"];
      sample_videos: ReportRow["sample_videos"];
      feed_status: ReportRow["feed_status"];
      video_count: number;
    },
  ): Promise<ReportRow | null>;
  deleteReport(id: string, sessionId: string): Promise<boolean>;
  countReports(sessionId: string): Promise<number>;
  countAllReports(): Promise<number>;
  verdictDistribution(): Promise<{ verdict: string; count: number; score: number }[]>;
  appendAudit(event: AuditEventInput): Promise<AuditRow>;
  listAudit(entityType?: string, entityId?: string, limit?: number): Promise<AuditRow[]>;
  findAuditByIdempotencyKey(key: string): Promise<AuditRow | null>;
  getSettings(sessionId: string): Promise<Record<string, number> | null>;
  saveSettings(sessionId: string, weights: Record<string, number>): Promise<void>;
  deleteAllReports(sessionId: string): Promise<number>;
  recordSnapshot(s: SnapshotInput): Promise<void>;
  listSnapshots(channelId: string, limit: number): Promise<SnapshotRow[]>;
  createComparison(c: Omit<ComparisonRow, "created_at">): Promise<ComparisonRow>;
  listComparisons(sessionId: string, limit: number): Promise<ComparisonRow[]>;
  ping(): Promise<boolean>;
}
