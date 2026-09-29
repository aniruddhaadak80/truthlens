import { describe, expect, it } from "vitest";
import { analyzeChannel, ENGINE_VERSION } from "@/lib/engine/credibility";
import type { VideoSample } from "@/lib/types";

function video(title: string, description = "", daysAgo = 10, views = 1000): VideoSample {
  return {
    title,
    description,
    publishedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    views,
    url: "https://www.youtube.com/watch?v=test",
  };
}

const CLEAN_VIDEOS: VideoSample[] = [
  video("How coral reefs recover after bleaching", "Field footage and a summary of the 2024 reef survey data. Sources linked below.", 3),
  video("The physics of why bridges wobble", "A walkthrough of resonance with the Tacoma Narrows case study. References: openstax.org.", 10),
  video("What the new exoplanet spectra show", "We read the JWST paper and explain what the data supports and what it does not.", 17),
  video("How vaccines are tested: the trial pipeline", "An overview of phase I-III trials with links to the published protocols.", 24),
  video("Why the sky is blue and sunsets are red", "Rayleigh scattering explained with simple experiments.", 31),
  video("The engineering behind reusable rockets", "Propulsion basics and what changed between 2015 and today. Sources: NASA reports.", 38),
];

const OUTRAGE_VIDEOS: VideoSample[] = [
  video("They DON'T Want You To See This!!", "Use code BREAKING for 15% off!!!", 1),
  video("SHOCKING: The truth they are hiding", "Do your own research. Wake up sheeple.", 2),
  video("DESTROYED: The media won't show you this", "Mainstream media is lying to you. Share before it's deleted!!!", 4),
  video("What they don't tell you about EVERYTHING", "The real truth. Number 1 will shock you.", 6),
  video("EXPOSED: The scam of the century", "This is 100% proven. They are corrupt and evil.", 8),
  video("You won't believe what they just did...", "Gone viral for a reason. Wait for the end.", 11),
];

describe("credibility engine", () => {
  it("scores a clean science channel high", () => {
    const result = analyzeChannel({ channelTitle: "Clean", videos: CLEAN_VIDEOS });
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.verdict).toBe("trusted");
    expect(result.version).toBe(ENGINE_VERSION);
  });

  it("scores an outrage channel low", () => {
    const result = analyzeChannel({ channelTitle: "Outrage", videos: OUTRAGE_VIDEOS });
    expect(result.score).toBeLessThan(45);
    expect(result.verdict).toBe("low_credibility");
  });

  it("returns itemized factors with weights and contributions", () => {
    const result = analyzeChannel({ channelTitle: "X", videos: CLEAN_VIDEOS });
    expect(result.factors).toHaveLength(6);
    const totalWeight = result.factors.reduce((s, f) => s + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
    const totalContribution = result.factors.reduce((s, f) => s + f.contribution, 0);
    expect(result.score).toBe(Math.round(totalContribution));
    for (const f of result.factors) {
      expect(f.score).toBeGreaterThanOrEqual(0);
      expect(f.score).toBeLessThanOrEqual(100);
      expect(f.explanation.length).toBeGreaterThan(0);
    }
  });

  it("collects evidence phrases for the outrage channel", () => {
    const result = analyzeChannel({ channelTitle: "Outrage", videos: OUTRAGE_VIDEOS });
    const controversy = result.factors.find((f) => f.key === "controversy_temperature")!;
    expect(controversy.evidence.length).toBeGreaterThan(0);
    expect(result.signals.controversy.length).toBeGreaterThan(0);
  });

  it("handles empty and boundary inputs", () => {
    const empty = analyzeChannel({ channelTitle: "Empty", videos: [] });
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.score).toBeLessThanOrEqual(100);
    expect(empty.factors).toHaveLength(6);

    const single = analyzeChannel({ channelTitle: "One", videos: [video("A single video")] });
    expect(single.factors.find((f) => f.key === "cadence_consistency")!.score).toBe(40);
  });

  it("is deterministic across repeated runs", () => {
    const a = analyzeChannel({ channelTitle: "X", videos: OUTRAGE_VIDEOS });
    const b = analyzeChannel({ channelTitle: "X", videos: OUTRAGE_VIDEOS });
    expect(a.score).toBe(b.score);
    expect(JSON.stringify(a.factors)).toBe(JSON.stringify(b.factors));
  });

  it("respects custom weights", () => {
    const standard = analyzeChannel({ channelTitle: "X", videos: OUTRAGE_VIDEOS });
    const weighted = analyzeChannel(
      { channelTitle: "X", videos: OUTRAGE_VIDEOS },
      { claim_discipline: 0.05, controversy_temperature: 0.05, clickbait_pressure: 0.1, sentiment_balance: 0.6, cadence_consistency: 0.1, transparency: 0.1 },
    );
    expect(weighted.score).not.toBe(standard.score);
    const sent = weighted.factors.find((f) => f.key === "sentiment_balance")!;
    expect(sent.weight).toBe(0.6);
    expect(weighted.weights.sentiment_balance).toBe(0.6);
  });

  it("produces a recommendation string", () => {
    const result = analyzeChannel({ channelTitle: "X", videos: CLEAN_VIDEOS });
    expect(result.recommendation.length).toBeGreaterThan(20);
  });
});
