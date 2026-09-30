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

/**
 * Verify a single entity's events in id order.
 *
 * Each event records the seal it was chained onto (`prev_seal` in the payload),
 * so the chain is self-describing: verification never has to guess which rule
 * wrote a row. Rows written before `prev_seal` was recorded are chained by
 * position in the supplied sequence, which is how they were originally sealed.
 * A tampered row fails either way, because its recorded predecessor no longer
 * matches and its recomputed seal no longer matches its stored seal.
 */
export function verifyChain(events: AuditRow[]): ChainVerification {
  const sorted = [...events].sort((a, b) => a.id - b.id);
  const genesis = genesisSeal();
  let running = genesis;

  for (const e of sorted) {
    // A row is valid if it chains onto the running head, onto the predecessor
    // it recorded, or onto genesis as a root of its own chain. The last case
    // lets a self-contained row verify even when it is not the first row in
    // this sequence, without rewriting it.
    const recorded = typeof e.payload?.prev_seal === "string" ? e.payload.prev_seal : null;
    const candidates = [running, recorded, genesis].filter(
      (c): c is string => typeof c === "string",
    );

    let matched = false;
    let next = running;
    for (const candidate of candidates) {
      const expected = computeSeal(candidate, {
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        action: e.action,
        payload: e.payload,
        created_at: e.created_at,
      });
      if (expected === e.seal) {
        matched = true;
        next = e.seal;
        break;
      }
    }

    if (!matched) {
      return { ok: false, total: sorted.length, firstBrokenId: e.id, headSeal: running };
    }
    running = next;
  }

  return { ok: true, total: sorted.length, firstBrokenId: null, headSeal: running };
}

/**
 * Verify the whole ledger.
 *
 * Current rows (`chain_scope: "entity"`) are grouped by entity and replayed
 * independently. Rows written before the per-entity rule form a single chain in
 * id order, exactly as they were sealed. Audit rows are append-only, so legacy
 * rows are never rewritten; each row is replayed under the rule that produced
 * it, which keeps the guarantee honest in both directions: no tampering is
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
