import { describe, expect, it } from "vitest";
import { extractClaims, classifyClaim } from "@/lib/engine/claims";
import { parseCaptions } from "@/lib/youtube/transcript";
import type { VideoSample } from "@/lib/types";

function video(title: string, description = ""): VideoSample {
  return {
    title,
    description,
    publishedAt: new Date("2026-09-01T00:00:00.000Z").toISOString(),
    views: 1000,
    url: "https://www.youtube.com/watch?v=abc",
  };
}

describe("claim classification", () => {
  it("classifies quantitative statements as empirical", () => {
    const c = classifyClaim("The vaccine reduced infection by 94% in the trial.");
    expect(c.category).toBe("empirical");
  });

  it("classifies causal statements", () => {
    const c = classifyClaim("This policy leads to higher prices because of the tariff.");
    expect(c.category).toBe("causal");
  });

  it("classifies predictions", () => {
    const c = classifyClaim("Next year the rate will double again.");
    expect(c.category).toBe("predictive");
  });

  it("classifies value judgements as normative", () => {
    const c = classifyClaim("Everyone should support this policy for the future.");
    expect(c.category).toBe("normative");
  });

  it("flags absolute language as an overclaim", () => {
    const c = classifyClaim("They always lie and everyone knows the truth is obvious.");
    expect(c.stance).toBe("overclaim");
    expect(c.absoluteness).toBeGreaterThan(0);
  });

  it("recognises hedging", () => {
    const c = classifyClaim("This might be a partial explanation, and it probably varies.");
    expect(c.stance).toBe("hedge");
  });
});

describe("claim extraction", () => {
  it("extracts claims from titles and descriptions with no transcripts", () => {
    const inventory = extractClaims([
      video("We measured a 30% effect", "According to the study, the sample was 400 people."),
    ]);
    expect(inventory.claims.length).toBeGreaterThan(0);
    expect(inventory.coverageLabel).toBe("titles");
    expect(inventory.analyzedUnits).toBeGreaterThan(0);
  });

  it("prefers attributed and quantitative claims as load-bearing", () => {
    const inventory = extractClaims([
      video("A quick opinion", "Honestly I just think it is fine, you know."),
      video("The measured result", "According to the published study, the effect was 30% at p<0.05."),
    ]);
    const loadBearing = inventory.claims.filter((c) => c.loadBearing);
    expect(loadBearing.length).toBeGreaterThan(0);
    expect(loadBearing.some((c) => c.category === "empirical" || c.category === "attribution")).toBe(true);
  });

  it("deduplicates repeated sentences", () => {
    const inventory = extractClaims([
      video("The same line", "This is the same claim repeated verbatim in the description."),
      video("Another title", "This is the same claim repeated verbatim in the description."),
    ]);
    const texts = inventory.claims.map((c) => c.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("handles empty input without throwing", () => {
    const inventory = extractClaims([]);
    expect(inventory.claims).toHaveLength(0);
    expect(inventory.falsifiableRatio).toBe(0);
  });

  it("is deterministic across runs", () => {
    const videos = [video("Claim A", "A measured 12% change."), video("Claim B", "This is 50% wrong.")];
    const a = extractClaims(videos);
    const b = extractClaims(videos);
    expect(JSON.stringify(a.claims)).toBe(JSON.stringify(b.claims));
  });
});

describe("caption parsing", () => {
  it("parses the legacy XML caption format", () => {
    const xml = `<transcript><text start="0.5" dur="1.2">Hello there</text><text start="2.0" dur="1.0">Second line</text></transcript>`;
    const segs = parseCaptions(xml);
    expect(segs).toHaveLength(2);
    expect(segs[0].text).toBe("Hello there");
    expect(segs[0].startSeconds).toBe(0.5);
  });

  it("parses the json3 caption format", () => {
    const json = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "First" }] },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "Second" }] },
      ],
    });
    const segs = parseCaptions(json);
    expect(segs).toHaveLength(2);
    expect(segs[1].text).toBe("Second");
  });

  it("decodes entities in captions", () => {
    const xml = `<transcript><text start="0" dur="1">Tom &amp; Jerry said &quot;hi&quot;</text></transcript>`;
    const segs = parseCaptions(xml);
    expect(segs[0].text).toBe('Tom & Jerry said "hi"');
  });

  it("returns empty for malformed input", () => {
    expect(parseCaptions("")).toHaveLength(0);
    expect(parseCaptions("not captions at all")).toHaveLength(0);
    expect(parseCaptions("{ broken json")).toHaveLength(0);
  });
});
