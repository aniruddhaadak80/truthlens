import { createHash } from "crypto";
import type { AuditRow } from "@/lib/types";

export const GENESIS_INPUT = "truthlens:genesis:v1";

export function sha384(input: string): string {
  return createHash("sha384").update(input, "utf8").digest("hex");
}

export function genesisSeal(): string {
  return sha384(GENESIS_INPUT);
}

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export interface SealEvent {
  entity_type: string;
  entity_id: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export function computeSeal(prevSeal: string, event: SealEvent): string {
  return sha384(prevSeal + canonicalJson(event));
}

export interface ChainVerification {
  ok: boolean;
  total: number;
  firstBrokenId: number | null;
  headSeal: string;
}

export function verifyChain(events: AuditRow[]): ChainVerification {
  const sorted = [...events].sort((a, b) => a.id - b.id);
  let prev = genesisSeal();
  for (const e of sorted) {
    const expected = computeSeal(prev, {
      entity_type: e.entity_type,
      entity_id: e.entity_id,
      action: e.action,
      payload: e.payload,
      created_at: e.created_at,
    });
    if (expected !== e.seal) {
      return { ok: false, total: sorted.length, firstBrokenId: e.id, headSeal: prev };
    }
    prev = e.seal;
  }
  return { ok: true, total: sorted.length, firstBrokenId: null, headSeal: prev };
}

/**
 * Verify the whole ledger. Each entity is sealed against its own previous
 * event, so a single interleaved sequence is not a valid chain to replay —
 * entities interleave by write time. Grouping by entity and replaying each
 * independently is the correct model and is what a tamperer cannot exploit
 * without rewriting that entity's whole history.
 */
export function verifyLedger(events: AuditRow[]): ChainVerification & { entities: number } {
  const groups = new Map<string, AuditRow[]>();
  for (const e of events) {
    const key = `${e.entity_type}:${e.entity_id}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  let brokenId: number | null = null;
  let headSeal = genesisSeal();
  let total = 0;

  for (const [, group] of [...groups.entries()].sort((a, b) => {
    const ai = Math.min(...a[1].map((e) => e.id));
    const bi = Math.min(...b[1].map((e) => e.id));
    return ai - bi;
  })) {
    const result = verifyChain(group);
    total += group.length;
    if (!result.ok && brokenId === null) brokenId = result.firstBrokenId;
    if (result.total > 0) headSeal = result.headSeal;
  }

  return { ok: brokenId === null, total, firstBrokenId: brokenId, headSeal, entities: groups.size };
}
