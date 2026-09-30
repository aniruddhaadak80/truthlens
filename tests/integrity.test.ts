import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeSeal,
  genesisSeal,
  verifyChain,
  verifyLedger,
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

describe("ledger verification", () => {
  function scopedEvent(
    id: number,
    entityId: string,
    prevSeal: string,
    action: string,
    created_at: string,
  ): AuditRow {
    const payload = { action, n: id, chain_scope: "entity" };
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

  it("verifies interleaved entity chains as a ledger", () => {
    // Entities interleave by write time, so a single global sequence is not a
    // valid chain. The ledger must verify each entity on its own.
    const a1 = scopedEvent(1, "ra", genesisSeal(), "create", "2026-02-01T00:00:00.000Z");
    const b1 = scopedEvent(2, "rb", genesisSeal(), "create", "2026-02-02T00:00:00.000Z");
    const a2 = scopedEvent(3, "ra", a1.seal, "update", "2026-02-03T00:00:00.000Z");
    const b2 = scopedEvent(4, "rb", b1.seal, "delete", "2026-02-04T00:00:00.000Z");

    const ledger = verifyLedger([a1, b1, a2, b2]);
    expect(ledger.ok).toBe(true);
    expect(ledger.entities).toBe(2);
    expect(ledger.total).toBe(4);
    expect(ledger.firstBrokenId).toBeNull();
  });

  it("replays legacy global-chained rows alongside entity-scoped rows", () => {
    // Rows written before the per-entity rule are append-only and must not be
    // rewritten, so the ledger replays them under their original rule.
    const legacy1 = event(1, genesisSeal(), "create", "2026-02-01T00:00:00.000Z");
    const legacy2 = event(2, legacy1.seal, "update", "2026-02-02T00:00:00.000Z");
    const legacy3 = event(3, legacy2.seal, "delete", "2026-02-03T00:00:00.000Z");
    const modern = scopedEvent(4, "rmodern", genesisSeal(), "create", "2026-02-04T00:00:00.000Z");

    const ledger = verifyLedger([legacy1, legacy2, legacy3, modern]);
    expect(ledger.ok).toBe(true);
    expect(ledger.total).toBe(4);
    expect(ledger.entities).toBe(2);
  });

  it("still detects tampering in a legacy global chain", () => {
    const legacy1 = event(1, genesisSeal(), "create", "2026-02-01T00:00:00.000Z");
    const legacy2 = event(2, legacy1.seal, "update", "2026-02-02T00:00:00.000Z");
    const tampered = { ...legacy2, payload: { action: "delete", n: 2 } };

    const ledger = verifyLedger([legacy1, tampered]);
    expect(ledger.ok).toBe(false);
    expect(ledger.firstBrokenId).toBe(2);
  });

  it("reports the first broken link inside a tampered entity", () => {
    const a1 = scopedEvent(1, "ra", genesisSeal(), "create", "2026-02-01T00:00:00.000Z");
    const b1 = scopedEvent(2, "rb", genesisSeal(), "create", "2026-02-02T00:00:00.000Z");
    const a2 = scopedEvent(3, "ra", a1.seal, "update", "2026-02-03T00:00:00.000Z");
    const tampered = { ...a2, payload: { action: "delete", n: 3, chain_scope: "entity" } };

    const ledger = verifyLedger([a1, b1, tampered]);
    expect(ledger.ok).toBe(false);
    expect(ledger.firstBrokenId).toBe(3);
  });

  it("treats an empty ledger as verified", () => {
    const ledger = verifyLedger([]);
    expect(ledger.ok).toBe(true);
    expect(ledger.entities).toBe(0);
    expect(ledger.total).toBe(0);
  });

  it("verifies self-contained rows that were sealed before prev_seal was recorded", () => {
    // Rows written before the predecessor was recorded in the payload chain by
    // position. Ones written under the per-entity rule are roots of their own
    // chain, so they must verify without being rewritten.
    const legacy1 = event(1, genesisSeal(), "create", "2026-02-01T00:00:00.000Z");
    const selfContained = sealEvent(2, "rx", genesisSeal(), "create", "2026-02-02T00:00:00.000Z");
    const ledger = verifyLedger([legacy1, selfContained]);
    expect(ledger.ok).toBe(true);
    expect(ledger.total).toBe(2);
  });

  it("still detects tampering when a row is a self-contained root", () => {
    const a = sealEvent(1, "rx", genesisSeal(), "create", "2026-02-01T00:00:00.000Z");
    const tampered = { ...a, payload: { action: "delete", n: 1 } };
    expect(verifyLedger([a, tampered]).ok).toBe(false);
  });
});
