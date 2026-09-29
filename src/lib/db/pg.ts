import { Pool } from "pg";
import type { AuditRow, ReportRow } from "@/lib/types";
import { SCHEMA_SQL, type NewReport, type Repository, type ReportListOptions } from "./repository";

interface ReportRecord {
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
  note: string;
  user_verdict: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface AuditRecord {
  id: number;
  session_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: Record<string, unknown>;
  seal: string;
  created_at: Date;
}

interface SettingRecord {
  session_id: string;
  weights: Record<string, number>;
}

function mapReport(r: ReportRecord): ReportRow {
  return {
    id: r.id,
    session_id: r.session_id,
    channel_title: r.channel_title,
    channel_handle: r.channel_handle,
    channel_id: r.channel_id,
    source_url: r.source_url,
    video_count: r.video_count,
    engine_version: r.engine_version,
    score: r.score,
    verdict: r.verdict,
    factors: r.factors,
    signals: r.signals,
    sample_videos: r.sample_videos,
    feed_status: r.feed_status,
    note: r.note,
    user_verdict: r.user_verdict,
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
    deleted_at: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
  };
}

function mapAudit(r: AuditRecord): AuditRow {
  return {
    id: r.id,
    session_id: r.session_id,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    action: r.action,
    payload: r.payload,
    seal: r.seal,
    created_at: new Date(r.created_at).toISOString(),
  };
}

export async function createPgRepository(connectionString: string): Promise<Repository> {
  const pool = new Pool({ connectionString, max: 8 });

  return {
    kind: "pg",

    async init() {
      await pool.query(SCHEMA_SQL);
    },

    async createReport(r: NewReport): Promise<ReportRow> {
      const res = await pool.query(
        `INSERT INTO reports (id, session_id, channel_title, channel_handle, channel_id, source_url, video_count, engine_version, score, verdict, factors, signals, sample_videos, feed_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [
          r.id, r.session_id, r.channel_title, r.channel_handle, r.channel_id, r.source_url,
          r.video_count, r.engine_version, r.score, r.verdict,
          JSON.stringify(r.factors), JSON.stringify(r.signals), JSON.stringify(r.sample_videos), r.feed_status,
        ],
      );
      return mapReport(res.rows[0] as ReportRecord);
    },

    async getReport(id: string, sessionId?: string): Promise<ReportRow | null> {
      const res = sessionId
        ? await pool.query(`SELECT * FROM reports WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL`, [id, sessionId])
        : await pool.query(`SELECT * FROM reports WHERE id = $1 AND deleted_at IS NULL`, [id]);
      return res.rows.length ? mapReport(res.rows[0] as ReportRecord) : null;
    },

    async listReports(sessionId: string, opts: ReportListOptions = {}): Promise<ReportRow[]> {
      const limit = Math.min(opts.limit ?? 50, 200);
      const offset = opts.offset ?? 0;
      const res = await pool.query(
        `SELECT * FROM reports WHERE session_id = $1 ${opts.includeDeleted ? "" : "AND deleted_at IS NULL"} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [sessionId, limit, offset],
      );
      return res.rows.map((r) => mapReport(r as ReportRecord));
    },

    async listRecentReports(limit: number): Promise<ReportRow[]> {
      const res = await pool.query(
        `SELECT * FROM reports WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return res.rows.map((r) => mapReport(r as ReportRecord));
    },

    async updateReport(
      id: string,
      sessionId: string,
      patch: { note?: string; user_verdict?: string },
    ): Promise<ReportRow | null> {
      const res = await pool.query(
        `UPDATE reports SET note = COALESCE($3, note), user_verdict = COALESCE($4, user_verdict), updated_at = now()
         WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL RETURNING *`,
        [id, sessionId, patch.note ?? null, patch.user_verdict ?? null],
      );
      return res.rows.length ? mapReport(res.rows[0] as ReportRecord) : null;
    },

    async deleteReport(id: string, sessionId: string): Promise<boolean> {
      const res = await pool.query(
        `UPDATE reports SET deleted_at = now(), updated_at = now() WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL`,
        [id, sessionId],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async countReports(sessionId: string): Promise<number> {
      const res = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM reports WHERE session_id = $1 AND deleted_at IS NULL`,
        [sessionId],
      );
      return Number(res.rows[0].count);
    },

    async countAllReports(): Promise<number> {
      const res = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM reports WHERE deleted_at IS NULL`,
      );
      return Number(res.rows[0].count);
    },

    async verdictDistribution(): Promise<{ verdict: string; count: number; score: number }[]> {
      const res = await pool.query<{ verdict: string; count: string; score: string }>(
        `SELECT verdict, count(*)::text AS count, round(avg(score))::int AS score FROM reports WHERE deleted_at IS NULL GROUP BY verdict`,
      );
      return res.rows.map((r) => ({ verdict: r.verdict, count: Number(r.count), score: Number(r.score) }));
    },

    async appendAudit(event: {
      session_id: string;
      entity_type: string;
      entity_id: string;
      action: string;
      payload: Record<string, unknown>;
    }): Promise<AuditRow> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const last = await client.query<{ seal: string }>(
          `SELECT seal FROM audit_events ORDER BY id DESC LIMIT 1`,
        );
        const prevSeal = last.rows.length ? (last.rows[0] as { seal: string }).seal : "GENESIS";
        const { computeSeal, genesisSeal } = await import("@/lib/integrity/chain");
        const base = prevSeal === "GENESIS" ? genesisSeal() : prevSeal;
        const createdAt = new Date().toISOString();
        const seal = computeSeal(base, {
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          action: event.action,
          payload: event.payload,
          created_at: createdAt,
        });
        const res = await client.query(
          `INSERT INTO audit_events (session_id, entity_type, entity_id, action, payload, seal, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [event.session_id, event.entity_type, event.entity_id, event.action, JSON.stringify(event.payload), seal, createdAt],
        );
        await client.query("COMMIT");
        return mapAudit(res.rows[0] as AuditRecord);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },

    async listAudit(entityType?: string, entityId?: string, limit = 100): Promise<AuditRow[]> {
      let sql = `SELECT * FROM audit_events`;
      const conds: string[] = [];
      const params: unknown[] = [];
      if (entityType) {
        params.push(entityType);
        conds.push(`entity_type = $${params.length}`);
      }
      if (entityId) {
        params.push(entityId);
        conds.push(`entity_id = $${params.length}`);
      }
      if (conds.length) sql += ` WHERE ${conds.join(" AND ")}`;
      params.push(Math.min(limit, 500));
      sql += ` ORDER BY id DESC LIMIT $${params.length}`;
      const res = await pool.query(sql, params);
      return res.rows.map((r) => mapAudit(r as AuditRecord));
    },

    async findAuditByIdempotencyKey(key: string): Promise<AuditRow | null> {
      const res = await pool.query(
        `SELECT * FROM audit_events WHERE payload->>'idempotency_key' = $1 ORDER BY id DESC LIMIT 1`,
        [key],
      );
      return res.rows.length ? mapAudit(res.rows[0] as AuditRecord) : null;
    },

    async getSettings(sessionId: string): Promise<Record<string, number> | null> {
      const res = await pool.query<SettingRecord>(`SELECT * FROM settings WHERE session_id = $1`, [sessionId]);
      return res.rows.length ? (res.rows[0] as SettingRecord).weights : null;
    },

    async saveSettings(sessionId: string, weights: Record<string, number>): Promise<void> {
      await pool.query(
        `INSERT INTO settings (session_id, weights, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (session_id) DO UPDATE SET weights = $2, updated_at = now()`,
        [sessionId, JSON.stringify(weights)],
      );
    },

    async deleteAllReports(sessionId: string): Promise<number> {
      const res = await pool.query(
        `UPDATE reports SET deleted_at = now(), updated_at = now() WHERE session_id = $1 AND deleted_at IS NULL`,
        [sessionId],
      );
      return res.rowCount ?? 0;
    },

    async ping(): Promise<boolean> {
      try {
        await pool.query(`SELECT 1`);
        return true;
      } catch {
        return false;
      }
    },
  };
}
