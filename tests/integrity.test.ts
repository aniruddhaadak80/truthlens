import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeSeal,
  genesisSeal,
  verifyChain,
} from "@/lib/integrity/chain";
import type { AuditRow } from "@/lib/types";

function event(id: number, prevSeal: string, action: string, created_at: string): AuditRow {
  return sealEvent(id, `r${id}`, prevSeal, action, created_at);
}

function sealEvent(
  id: number,
  entityId: string,
  prevSeal: string,
  action: string,
  created_at: string,
): AuditRow {
  const payload = { action, n: id };
  return {
    id,
    session_id: "s1",
    entity_type: "report",
    entity_id: entityId,
    action,
    payload,
    seal: computeSeal(prevSeal, {
      entity_type: "report",
      entity_id: entityId,
      action,
      payload,
      created_at,
    }),
    created_at,
  };
}

describe("integrity chain", () => {
  it("sorts object keys canonically", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: { d: 4, c: 3 }, b: [2, 1] })).toBe('{"a":{"c":3,"d":4},"b":[2,1]}');
  });

  it("verifies an unbroken chain", () => {
    let prev = genesisSeal();
    const events: AuditRow[] = [];
    for (let i = 1; i <= 5; i++) {
      const e = event(i, prev, i % 2 ? "create" : "update", `2026-01-0${i}T00:00:00.000Z`);
      events.push(e);
      prev = e.seal;
    }
    const result = verifyChain(events);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(5);
    expect(result.firstBrokenId).toBeNull();
  });

  it("detects a broken link and reports the first broken event id", () => {
    let prev = genesisSeal();
    const events: AuditRow[] = [];
    for (let i = 1; i <= 5; i++) {
      const e = event(i, prev, "create", `2026-01-0${i}T00:00:00.000Z`);
      events.push(e);
      prev = e.seal;
    }
    const tampered = events.map((e, i) =>
      i === 2 ? { ...e, payload: { action: "create", n: 999 } } : e,
    );
    const result = verifyChain(tampered);
    expect(result.ok).toBe(false);
    expect(result.firstBrokenId).toBe(3);
  });

  it("detects a deleted middle event", () => {
    let prev = genesisSeal();
    const events: AuditRow[] = [];
    for (let i = 1; i <= 5; i++) {
      const e = event(i, prev, "create", `2026-01-0${i}T00:00:00.000Z`);
      events.push(e);
      prev = e.seal;
    }
    const result = verifyChain(events.filter((e) => e.id !== 3));
    expect(result.ok).toBe(false);
    expect(result.firstBrokenId).toBe(4);
  });

  it("genesis seal is stable", () => {
    expect(genesisSeal()).toBe(genesisSeal());
    expect(genesisSeal()).toHaveLength(96);
  });

  it("verifies each entity chain independently from genesis", () => {
    // Each entity's chain is sealed against its own previous seal, so an
    // entity's events replay correctly in isolation even though other
    // entities were appended in between.
    const a1 = sealEvent(1, "ra", genesisSeal(), "create", "2026-02-01T00:00:00.000Z");
    const b1 = sealEvent(2, "rb", genesisSeal(), "create", "2026-02-02T00:00:00.000Z");
    const a2 = sealEvent(3, "ra", a1.seal, "update", "2026-02-03T00:00:00.000Z");

    const entityA = verifyChain([a1, a2]);
    expect(entityA.ok).toBe(true);
    expect(entityA.total).toBe(2);

    const entityB = verifyChain([b1]);
    expect(entityB.ok).toBe(true);
  });
});
