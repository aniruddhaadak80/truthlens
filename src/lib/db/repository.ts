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
  ping(): Promise<boolean>;
}
