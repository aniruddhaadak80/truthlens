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
 * Verify the whole ledger.
 *
 * Events are sealed under one of two rules, recorded in the payload as
 * `chain_scope`:
 *
 * - `entity` (current): an event is sealed against the previous event of the
 *   same entity, so each report replays independently.
 * - absent (legacy): the event was sealed against the previous event in the
 *   whole ledger, in id order.
 *
 * Audit rows are append-only, so legacy rows are never rewritten to the newer
 * rule. Instead each row is replayed under the rule it was actually written
 * with, which keeps the guarantee honest in both directions: no tampering is
 * masked, and a scheme change is not reported as tampering.
 */
export function verifyLedger(events: AuditRow[]): ChainVerification & { entities: number } {
  const isEntityScoped = (e: AuditRow) => e.payload?.chain_scope === "entity";

  const legacy = events.filter((e) => !isEntityScoped(e));
  const scoped = events.filter(isEntityScoped);

  const groups = new Map<string, AuditRow[]>();
  for (const e of scoped) {
    const key = `${e.entity_type}:${e.entity_id}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  let brokenId: number | null = null;
  let headSeal = genesisSeal();

  // Legacy rows form one chain in id order, exactly as they were sealed.
  if (legacy.length > 0) {
    const result = verifyChain(legacy);
    if (!result.ok && brokenId === null) brokenId = result.firstBrokenId;
    headSeal = result.headSeal;
  }

  for (const group of groups.values()) {
    const result = verifyChain(group);
    if (!result.ok && brokenId === null) brokenId = result.firstBrokenId;
  }

  return {
    ok: brokenId === null,
    total: events.length,
    firstBrokenId: brokenId,
    headSeal,
    entities: groups.size + (legacy.length > 0 ? 1 : 0),
  };
}
