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
