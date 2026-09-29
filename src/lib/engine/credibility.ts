import {
  ABSOLUTE_CLAIMS,
  CLICKBAIT_PHRASES,
  CONSPIRACY_MARKERS,
  CONTROVERSY_WORDS,
  DISCLOSURE_MARKERS,
  NEGATIVE_WORDS,
  POSITIVE_WORDS,
} from "./lexicons";
import {
  DEFAULT_WEIGHTS,
  VERDICT_LABELS,
  type EngineResult,
  type EngineWeights,
  type FactorResult,
  type PhraseEvidence,
  type Verdict,
  type VideoSample,
} from "@/lib/types";

export const ENGINE_VERSION = "2026.1.0";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countPhrase(text: string, phrase: string): number {
  const re = new RegExp(escapeRegExp(phrase), "gi");
  return (text.match(re) || []).length;
}

function countAll(text: string, phrases: string[]): PhraseEvidence[] {
  const lower = text.toLowerCase();
  const hits: PhraseEvidence[] = [];
  for (const phrase of phrases) {
    const c = countPhrase(lower, phrase.toLowerCase());
    if (c > 0) hits.push({ phrase, count: c });
  }
  return hits.sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase));
}

function mergeEvidence(...groups: PhraseEvidence[][]): PhraseEvidence[] {
  const map = new Map<string, number>();
  for (const group of groups) {
    for (const e of group) map.set(e.phrase, (map.get(e.phrase) || 0) + e.count);
  }
  return [...map.entries()]
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase));
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function analyzeClaimDiscipline(titles: string[], descriptions: string[]): FactorResult {
  const allText = [...titles, ...descriptions].join("\n");
  const chars = Math.max(1, allText.length);
  const claims = countAll(allText, ABSOLUTE_CLAIMS);
  const conspiracy = countAll(allText, CONSPIRACY_MARKERS);
  const hits = claims.reduce((s, e) => s + e.count, 0) + conspiracy.reduce((s, e) => s + e.count, 0);
  const perK = (hits / chars) * 1000;
  const score = clamp(Math.round(100 - perK * 16), 0, 100);
  const evidence = mergeEvidence(claims, conspiracy).slice(0, 8);
  const explanation =
    hits === 0
      ? "No absolute-claim or conspiracy markers detected in the sampled videos."
      : `${hits} absolute-claim / conspiracy marker${hits === 1 ? "" : "s"} found (${perK.toFixed(1)} per 1,000 characters). Absolute language and suppression narratives correlate with lower epistemic rigor.`;
  return {
    key: "claim_discipline",
    label: "Claim discipline",
    score,
    weight: 0,
    contribution: 0,
    explanation,
    evidence,
  };
}

function analyzeControversy(titles: string[], descriptions: string[]): FactorResult {
  const allText = [...titles, ...descriptions].join("\n");
  const chars = Math.max(1, allText.length);
  const hits = countAll(allText, CONTROVERSY_WORDS);
  const total = hits.reduce((s, e) => s + e.count, 0);
  const perK = (total / chars) * 1000;
  const score = clamp(Math.round(100 - perK * 20), 0, 100);
  const evidence = hits.slice(0, 8);
  const explanation =
    total === 0
      ? "No outrage or attack vocabulary detected in the sampled videos."
      : `${total} controversy marker${total === 1 ? "" : "s"} (${perK.toFixed(1)} per 1,000 characters). Sustained outrage framing is a known engagement tactic that crowds out nuance.`;
  return {
    key: "controversy_temperature",
    label: "Controversy temperature",
    score,
    weight: 0,
    contribution: 0,
    explanation,
    evidence,
  };
}

function analyzeClickbait(titles: string[]): FactorResult {
  const phrases = countAll(titles.join("\n"), CLICKBAIT_PHRASES);
  const phraseHits = phrases.reduce((s, e) => s + e.count, 0);
  let capsWords = 0;
  let totalWords = 0;
  let exclamations = 0;
  let emojis = 0;
  for (const title of titles) {
    const words = title.split(/\s+/).filter(Boolean);
    totalWords += words.length;
    capsWords += words.filter((w) => w.length >= 4 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
    exclamations += (title.match(/!/g) || []).length;
    emojis += (title.match(EMOJI_RE) || []).length;
  }
  const capsRatio = totalWords > 0 ? capsWords / totalWords : 0;
  const exclPerTitle = titles.length > 0 ? exclamations / titles.length : 0;
  const emojiPerTitle = titles.length > 0 ? emojis / titles.length : 0;
  const penalty = clamp(capsRatio * 320 + exclPerTitle * 9 + emojiPerTitle * 7 + phraseHits * 11, 0, 100);
  const score = clamp(Math.round(100 - penalty), 0, 100);
  const evidence = phrases.slice(0, 8);
  const explanation =
    penalty === 0
      ? "Titles show no clickbait pressure: no caps-shouting, bait phrases, or punctuation spam."
      : `Clickbait pressure detected: ${(capsRatio * 100).toFixed(0)}% ALL-CAPS words, ${exclPerTitle.toFixed(1)} exclamation marks and ${emojiPerTitle.toFixed(1)} emoji per title, ${phraseHits} bait phrase${phraseHits === 1 ? "" : "s"}.`;
  return {
    key: "clickbait_pressure",
    label: "Clickbait pressure",
    score,
    weight: 0,
    contribution: 0,
    explanation,
    evidence,
  };
}

function analyzeSentiment(titles: string[]): FactorResult {
  const text = titles.join("\n");
  const positive = countAll(text, POSITIVE_WORDS);
  const negative = countAll(text, NEGATIVE_WORDS);
  const pos = positive.reduce((s, e) => s + e.count, 0);
  const neg = negative.reduce((s, e) => s + e.count, 0);
  const total = pos + neg;
  const score = total === 0 ? 55 : clamp(Math.round(50 + ((pos - neg) / total) * 50), 0, 100);
  const explanation =
    total === 0
      ? "No strong sentiment language in titles — neutral register."
      : `Sentiment balance: ${pos} positive vs ${neg} negative markers. ${
          pos >= neg
            ? "Titles lean constructive rather than fear-driven."
            : "Titles lean negative — fear and anger framing dominates."
        }`;
  return {
    key: "sentiment_balance",
    label: "Sentiment balance",
    score,
    weight: 0,
    contribution: 0,
    explanation,
    evidence: mergeEvidence(positive, negative).slice(0, 8),
  };
}

function analyzeCadence(videos: VideoSample[]): FactorResult {
  if (videos.length < 3) {
    return {
      key: "cadence_consistency",
      label: "Cadence consistency",
      score: 40,
      weight: 0,
      contribution: 0,
      explanation: `Only ${videos.length} video${videos.length === 1 ? "" : "s"} available — insufficient history to judge upload consistency.`,
      evidence: [],
    };
  }
  const sorted = [...videos].sort(
    (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
  );
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = (new Date(sorted[i].publishedAt).getTime() - new Date(sorted[i - 1].publishedAt).getTime()) / 86400000;
    if (days > 0) gaps.push(days);
  }
  let score = 70;
  if (gaps.length >= 2) {
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    score = clamp(Math.round(100 - cv * 55), 5, 100);
  }
  const latest = new Date(sorted[sorted.length - 1].publishedAt).getTime();
  const ageDays = (Date.now() - latest) / 86400000;
  if (ageDays > 365) score = Math.round(score * 0.8);
  const spanDays =
    gaps.length > 0
      ? (new Date(sorted[sorted.length - 1].publishedAt).getTime() - new Date(sorted[0].publishedAt).getTime()) / 86400000
      : 0;
  const explanation =
    `Upload cadence across ${videos.length} videos over ${Math.round(spanDays)} days. ` +
    (ageDays > 365
      ? "Channel has been silent for over a year — score reduced. "
      : "") +
    (score >= 70
      ? "Regular, predictable publishing suggests a sustainable, process-driven channel."
      : score >= 45
        ? "Irregular publishing — bursts and gaps are common in reactive channels."
        : "Highly erratic publishing pattern, typical of trend-chasing channels.");
  return {
    key: "cadence_consistency",
    label: "Cadence consistency",
    score,
    weight: 0,
    contribution: 0,
    explanation,
    evidence: [],
  };
}

function analyzeTransparency(descriptions: string[]): FactorResult {
  const nonEmpty = descriptions.filter((d) => d.trim().length > 0);
  if (nonEmpty.length === 0) {
    return {
      key: "transparency",
      label: "Transparency",
      score: 30,
      weight: 0,
      contribution: 0,
      explanation: "No video descriptions available — the channel provides no context, sources, or disclosures.",
      evidence: [],
    };
  }
  const avgLen = nonEmpty.reduce((s, d) => s + d.length, 0) / nonEmpty.length;
  const withLinks = nonEmpty.filter((d) => /https?:\/\//i.test(d)).length;
  const disclosures = countAll(nonEmpty.join("\n"), DISCLOSURE_MARKERS);
  const disclosureHits = disclosures.reduce((s, e) => s + e.count, 0);
  let score = clamp(Math.round(Math.min(avgLen / 10, 40) + (withLinks > 0 ? 20 : 0) + (disclosureHits > 0 ? 20 : 0)), 0, 100);
  if (avgLen < 40) score = Math.min(score, 35);
  const explanation =
    `Average description length ${Math.round(avgLen)} characters; ${withLinks}/${nonEmpty.length} descriptions contain links; ` +
    (disclosureHits > 0
      ? `${disclosureHits} sponsorship/affiliate disclosure marker${disclosureHits === 1 ? "" : "s"} found.`
      : "no sponsorship or affiliate disclosures found.");
  return {
    key: "transparency",
    label: "Transparency",
    score,
    weight: 0,
    contribution: 0,
    explanation,
    evidence: disclosures.slice(0, 8),
  };
}

function verdictFor(score: number): Verdict {
  if (score >= 70) return "trusted";
  if (score >= 55) return "mostly_reliable";
  if (score >= 40) return "mixed";
  return "low_credibility";
}

function recommendationFor(verdict: Verdict, weakest: FactorResult | null): string {
  const base: Record<Verdict, string> = {
    trusted:
      "This channel's public record shows disciplined claims, low outrage framing, and transparent disclosure. Still verify extraordinary claims independently.",
    mostly_reliable:
      "Generally reliable record with occasional pressure tactics. Worth following, but cross-check high-stakes claims before acting on them.",
    mixed:
      "Mixed signals: some credible patterns alongside engagement-driven tactics. Consume selectively and verify anything that influences decisions.",
    low_credibility:
      "The record shows repeated absolute claims, outrage framing, or bait patterns. High risk of misinformation — do not rely on this channel for important decisions.",
  };
  if (weakest && weakest.score < 50 && verdict !== "trusted") {
    return `${base[verdict]} Weakest area: ${weakest.label.toLowerCase()} (${weakest.score}/100).`;
  }
  return base[verdict];
}

export interface ChannelInput {
  channelTitle: string;
  videos: VideoSample[];
}

export function analyzeChannel(input: ChannelInput, weights?: Partial<EngineWeights>): EngineResult {
  const w: EngineWeights = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const titles = input.videos.map((v) => v.title);
  const descriptions = input.videos.map((v) => v.description);

  const raw: Omit<FactorResult, "weight" | "contribution">[] = [
    analyzeClaimDiscipline(titles, descriptions),
    analyzeControversy(titles, descriptions),
    analyzeClickbait(titles),
    analyzeSentiment(titles),
    analyzeCadence(input.videos),
    analyzeTransparency(descriptions),
  ];

  const weightByKey: Record<string, number> = {
    claim_discipline: w.claim_discipline,
    controversy_temperature: w.controversy_temperature,
    clickbait_pressure: w.clickbait_pressure,
    sentiment_balance: w.sentiment_balance,
    cadence_consistency: w.cadence_consistency,
    transparency: w.transparency,
  };

  const factors: FactorResult[] = raw.map((f) => {
    const weight = weightByKey[f.key] ?? 0;
    return { ...f, weight, contribution: Math.round(f.score * weight * 100) / 100 };
  });

  const score = clamp(Math.round(factors.reduce((s, f) => s + f.contribution, 0)), 0, 100);
  const verdict = verdictFor(score);
  const weakest = [...factors].sort((a, b) => a.score - b.score)[0] ?? null;

  const allText = [...titles, ...descriptions].join("\n");
  return {
    version: ENGINE_VERSION,
    score,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    factors,
    signals: {
      claims: countAll(allText, ABSOLUTE_CLAIMS).slice(0, 10),
      controversy: countAll(allText, CONTROVERSY_WORDS).slice(0, 10),
      clickbait: countAll(titles.join("\n"), CLICKBAIT_PHRASES).slice(0, 10),
      positive: countAll(titles.join("\n"), POSITIVE_WORDS).slice(0, 10),
      negative: countAll(titles.join("\n"), NEGATIVE_WORDS).slice(0, 10),
      disclosures: countAll(allText, DISCLOSURE_MARKERS).slice(0, 10),
    },
    recommendation: recommendationFor(verdict, weakest),
    videoCount: input.videos.length,
    analyzedAt: new Date().toISOString(),
    weights: weightByKey,
  };
}
