import type { VideoSample } from "@/lib/types";
import type { VideoTranscript } from "@/lib/youtube/transcript";

/**
 * A claim is a sentence a viewer would want checked. Each claim is classified so
 * the reader can tell a falsifiable measurement from a prediction or a value
 * judgement, and rated by how load-bearing it is for the channel's argument.
 */
export type ClaimCategory =
  | "empirical"
  | "causal"
  | "predictive"
  | "normative"
  | "attribution"
  | "vague";

export type Stance = "hedge" | "assert" | "overclaim";

export interface Claim {
  id: string;
  text: string;
  category: ClaimCategory;
  stance: Stance;
  hedgeCount: number;
  absoluteness: number;
  loadBearing: boolean;
  source: string;
  videoUrl?: string;
  timestampSeconds?: number;
  wordCount: number;
}

export interface ClaimInventory {
  claims: Claim[];
  byCategory: Record<ClaimCategory, number>;
  hedgeRatio: number;
  overclaimRatio: number;
  falsifiableRatio: number;
  analyzedUnits: number;
  coverageLabel: "titles" | "titles+transcript" | "transcript";
}

const HEDGES = [
  "might", "may", "could", "possibly", "perhaps", "suggests", "appears to",
  "likely", "roughly", "approximately", "about", "tend to", "generally",
  "in most cases", "some", "often", "usually", "we think", "it seems", "arguably",
  "to some extent", "partly", "relatively", "estimated", "preliminary",
];

const ABSOLUTES = [
  "always", "never", "everyone", "no one", "nobody", "all", "every", "completely",
  "totally", "definitely", "certainly", "undeniably", "must", "obviously",
  "clearly", "without question", "100%", "guaranteed", "the truth is", "proven",
  "there is no", "will happen", "cannot", "every single", "only reason",
];

const CAUSAL = [
  "because", "causes", "caused by", "leads to", "results in", "due to",
  "that's why", "the reason is", "causing", "drives", "explains why", "thanks to",
];

const PREDICTIVE = [
  "will", "going to", "in the future", "next year", "by 2030", "soon",
  "will be", "is going to", "expect", "forecast", "predict",
];

const NORMATIVE = [
  "should", "must not", "ought to", "need to", "we have to", "it is wrong",
  "it is right", "deserves", "shouldn't", "should not", "have a right",
  "is the best", "is the worst", "everyone should", "you need to",
];

const ATTRIBUTION = [
  "according to", "study", "studies", "research", "researchers", "paper",
  "published", "data shows", "evidence", "survey", "journal", "professor",
  "scientist", "university", "report found", "peer-reviewed", "meta-analysis",
];

const QUANTITATIVE = /\d+(\.\d+)?\s*(%|percent|x|times|million|billion|trillion|kg|km|mg|°c|°f|years?|days?|hours?)/i;

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z"'(])|\n+/;

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 400);
}

function countOccurrences(haystack: string, needles: string[]): number {
  let n = 0;
  for (const needle of needles) {
    const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    n += (haystack.match(re) || []).length;
  }
  return n;
}

export function classifyClaim(sentence: string): {
  category: ClaimCategory;
  stance: Stance;
  hedgeCount: number;
  absoluteness: number;
} {
  const lower = sentence.toLowerCase();
  const hedgeCount = countOccurrences(lower, HEDGES);
  const absoluteness = Math.min(1, countOccurrences(lower, ABSOLUTES) / 2);

  let category: ClaimCategory = "vague";
  if (QUANTITATIVE.test(sentence) && /\b\d/.test(sentence)) {
    category = "empirical";
  } else if (countOccurrences(lower, CAUSAL) > 0) {
    category = "causal";
  } else if (countOccurrences(lower, PREDICTIVE) > 0) {
    category = "predictive";
  } else if (countOccurrences(lower, NORMATIVE) > 0) {
    category = "normative";
  } else if (countOccurrences(lower, ATTRIBUTION) > 0) {
    category = "empirical";
  } else if (/\b(is|are|was|were|has|have|shows?|means?|proves?)\b/.test(lower)) {
    category = "empirical";
  }

  let stance: Stance = "assert";
  if (hedgeCount >= 2) stance = "hedge";
  else if (hedgeCount === 1 && absoluteness === 0) stance = "hedge";
  if (absoluteness >= 0.5 && hedgeCount === 0) stance = "overclaim";

  return { category, stance, hedgeCount, absoluteness };
}

function attributionDensity(sentence: string): boolean {
  return countOccurrences(sentence.toLowerCase(), ATTRIBUTION) > 0;
}

function stableId(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface ExtractOptions {
  maxClaims?: number;
  minWords?: number;
}

/**
 * Extract the most decision-relevant claims from titles, descriptions and any
 * transcripts we managed to fetch. Sentences that attribute evidence outrank
 * unsupported assertions, so the inventory leads with the checkable ones.
 */
export function extractClaims(
  videos: VideoSample[],
  transcripts: Record<string, VideoTranscript> = {},
  options: ExtractOptions = {},
): ClaimInventory {
  const maxClaims = options.maxClaims ?? 40;
  const minWords = options.minWords ?? 6;
  const hasTranscripts = Object.keys(transcripts).length > 0;

  const units: { text: string; source: string; videoUrl?: string; timestamp?: number }[] = [];

  for (const v of videos) {
    for (const s of splitSentences(v.title)) units.push({ text: s, source: "title", videoUrl: v.url });
    const descSentences = splitSentences(v.description).slice(0, 4);
    for (const s of descSentences) units.push({ text: s, source: "description", videoUrl: v.url });
    const transcript = transcripts[v.url];
    if (!transcript) continue;
    for (const seg of transcript.segments) {
      if (seg.text.split(/\s+/).length < minWords) continue;
      units.push({ text: seg.text, source: "transcript", videoUrl: v.url, timestamp: seg.startSeconds });
    }
  }

  const scored = units.map((u) => {
    const meta = classifyClaim(u.text);
    // Prefer attributed, quantitative, transcript-sourced material.
    let priority = 0;
    if (meta.category !== "vague") priority += 2;
    if (attributionDensity(u.text)) priority += 3;
    if (QUANTITATIVE.test(u.text)) priority += 2;
    if (u.source === "transcript") priority += 1;
    if (meta.stance === "overclaim") priority += 2;
    if (meta.stance === "hedge") priority += 1;
    return { unit: u, meta, priority };
  });

  scored.sort((a, b) => b.priority - a.priority);

  const seen = new Set<string>();
  const claims: Claim[] = [];
  for (const { unit, meta, priority } of scored) {
    if (claims.length >= maxClaims) break;
    const key = unit.text.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({
      id: stableId(`${unit.source}:${key}`),
      text: unit.text,
      category: meta.category,
      stance: meta.stance,
      hedgeCount: meta.hedgeCount,
      absoluteness: meta.absoluteness,
      loadBearing: priority >= 5,
      source: unit.source,
      videoUrl: unit.videoUrl,
      timestampSeconds: unit.timestamp,
      wordCount: unit.text.split(/\s+/).length,
    });
  }

  const byCategory: Record<ClaimCategory, number> = {
    empirical: 0,
    causal: 0,
    predictive: 0,
    normative: 0,
    attribution: 0,
    vague: 0,
  };
  let hedges = 0;
  let overclaims = 0;
  let falsifiable = 0;
  for (const c of claims) {
    byCategory[c.category]++;
    if (c.stance === "hedge") hedges++;
    if (c.stance === "overclaim") overclaims++;
    if (c.category === "empirical" || c.category === "causal" || c.category === "predictive") {
      falsifiable++;
    }
  }

  const total = claims.length;
  return {
    claims,
    byCategory,
    hedgeRatio: total ? hedges / total : 0,
    overclaimRatio: total ? overclaims / total : 0,
    falsifiableRatio: total ? falsifiable / total : 0,
    analyzedUnits: units.length,
    coverageLabel: hasTranscripts
      ? "titles+transcript"
      : videos.length > 0
        ? "titles"
        : "transcript",
  };
}
