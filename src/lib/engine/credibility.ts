import {
  ABSOLUTE_CLAIMS,
  CLICKBAIT_PHRASES,
  CONSPIRACY_MARKERS,
  CONTROVERSY_WORDS,
  CORRECTIVE_HEDGING,
  DISCLOSURE_MARKERS,
  NEGATIVE_WORDS,
  POSITIVE_WORDS,
  SOURCE_CITATION,
  UNFALSIFIABLE,
} from "./lexicons";
import { extractClaims, type ClaimInventory } from "./claims";
import {
  DEFAULT_WEIGHTS,
  VERDICT_LABELS,
  type EngineResult,
  type EngineWeights,
  type FactorResult,
  type PhraseEvidence,
  type TranscriptCoverage,
  type Verdict,
  type VideoOutlier,
  type VideoSample,
} from "@/lib/types";
import type { VideoTranscript } from "@/lib/youtube/transcript";

export const ENGINE_VERSION = "2026.2.0";

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

/** Per-video text bag used by both the aggregate factors and outlier scoring. */
interface Unit {
  video: VideoSample;
  text: string;
  transcript?: VideoTranscript;
  words: number;
}

function buildUnits(videos: VideoSample[], transcripts: Record<string, VideoTranscript>): Unit[] {
  return videos.map((video) => {
    const transcript = transcripts[video.url];
    const spoken = transcript?.text ?? "";
    return {
      video,
      text: `${video.title}\n${video.description}\n${spoken}`.trim(),
      transcript,
      words: spoken ? spoken.split(/\s+/).length : 0,
    };
  });
}

function analyzeClaimDiscipline(units: Unit[]): FactorResult {
  const allText = units.map((u) => u.text).join("\n");
  const chars = Math.max(1, allText.length);
  const claims = countAll(allText, ABSOLUTE_CLAIMS);
  const conspiracy = countAll(allText, CONSPIRACY_MARKERS);
  const hits = claims.reduce((s, e) => s + e.count, 0) + conspiracy.reduce((s, e) => s + e.count, 0);
  const perK = (hits / chars) * 1000;
  const score = clamp(Math.round(100 - perK * 16), 0, 100);
  const explanation =
    hits === 0
      ? "No absolute-claim or conspiracy markers detected in the sampled material."
      : `${hits} absolute-claim / conspiracy marker${hits === 1 ? "" : "s"} (${perK.toFixed(1)} per 1,000 characters). Absolute language and suppression narratives correlate with lower epistemic rigor.`;
  return {
    key: "claim_discipline",
    label: "Claim discipline",
    score,
    weight: 0,
    contribution: 0,
    explanation,
    evidence: mergeEvidence(claims, conspiracy).slice(0, 8),
  };
}

function analyzeControversy(units: Unit[]): FactorResult {
  const allText = units.map((u) => u.text).join("\n");
  const chars = Math.max(1, allText.length);
  const hits = countAll(allText, CONTROVERSY_WORDS);
  const total = hits.reduce((s, e) => s + e.count, 0);
  const perK = (total / chars) * 1000;
  const score = clamp(Math.round(100 - perK * 20), 0, 100);
  const explanation =
    total === 0
      ? "No outrage or attack vocabulary detected in the sampled material."
      : `${total} controversy marker${total === 1 ? "" : "s"} (${perK.toFixed(1)} per 1,000 characters). Sustained outrage framing is a known engagement tactic that crowds out nuance.`;
  return {
    key: "controversy_temperature",
    label: "Controversy temperature",
    score,
    weight: 0,
    contribution: 0,
    explanation,
    evidence: hits.slice(0, 8),
  };
}

function analyzeClickbait(units: Unit[]): FactorResult {
  const titles = units.map((u) => u.video.title);
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
  return {
    key: "clickbait_pressure",
    label: "Clickbait pressure",
    score,
    weight: 0,
    contribution: 0,
    explanation:
      penalty === 0
        ? "Titles show no clickbait pressure: no caps-shouting, bait phrases, or punctuation spam."
        : `Clickbait pressure detected: ${(capsRatio * 100).toFixed(0)}% ALL-CAPS words, ${exclPerTitle.toFixed(1)} exclamation marks and ${emojiPerTitle.toFixed(1)} emoji per title, ${phraseHits} bait phrase${phraseHits === 1 ? "" : "s"}.`,
    evidence: phrases.slice(0, 8),
  };
}

function analyzeSentiment(units: Unit[]): FactorResult {
  const text = units.map((u) => u.video.title).join("\n");
  const positive = countAll(text, POSITIVE_WORDS);
  const negative = countAll(text, NEGATIVE_WORDS);
  const pos = positive.reduce((s, e) => s + e.count, 0);
  const neg = negative.reduce((s, e) => s + e.count, 0);
  const total = pos + neg;
  const score = total === 0 ? 55 : clamp(Math.round(50 + ((pos - neg) / total) * 50), 0, 100);
  return {
    key: "sentiment_balance",
    label: "Sentiment balance",
    score,
    weight: 0,
    contribution: 0,
    explanation:
      total === 0
        ? "No strong sentiment language in titles — neutral register."
        : `Sentiment balance: ${pos} positive vs ${neg} negative markers. ${
            pos >= neg
              ? "Titles lean constructive rather than fear-driven."
              : "Titles lean negative — fear and anger framing dominates."
          }`,
    evidence: mergeEvidence(positive, negative).slice(0, 8),
  };
}

function analyzeCadence(units: Unit[]): FactorResult {
  const videos = units.map((u) => u.video);
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
  return {
    key: "cadence_consistency",
    label: "Cadence consistency",
    score,
    weight: 0,
    contribution: 0,
    explanation:
      `Upload cadence across ${videos.length} videos over ${Math.round(spanDays)} days. ` +
      (ageDays > 365 ? "Channel has been silent for over a year — score reduced. " : "") +
      (score >= 70
        ? "Regular, predictable publishing suggests a sustainable, process-driven channel."
        : score >= 45
          ? "Irregular publishing — bursts and gaps are common in reactive channels."
          : "Highly erratic publishing pattern, typical of trend-chasing channels."),
    evidence: [],
  };
}

function analyzeTransparency(units: Unit[]): FactorResult {
  const descriptions = units.map((u) => u.video.description);
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
  return {
    key: "transparency",
    label: "Transparency",
    score,
    weight: 0,
    contribution: 0,
    explanation:
      `Average description length ${Math.round(avgLen)} characters; ${withLinks}/${nonEmpty.length} descriptions contain links; ` +
      (disclosureHits > 0
        ? `${disclosureHits} sponsorship/affiliate disclosure marker${disclosureHits === 1 ? "" : "s"} found.`
        : "no sponsorship or affiliate disclosures found."),
    evidence: disclosures.slice(0, 8),
  };
}

function analyzeSourceCitation(units: Unit[]): FactorResult {
  const spoken = units.filter((u) => u.transcript);
  if (spoken.length === 0) {
    return {
      key: "source_citation",
      label: "Source citation",
      score: 50,
      weight: 0,
      contribution: 0,
      explanation:
        "No transcripts were available, so spoken sourcing could not be measured. Treated as neutral rather than penalised.",
      evidence: [],
    };
  }
  const totalWords = spoken.reduce((s, u) => s + u.words, 0);
  const hits = spoken.flatMap((u) => countAll(u.text, SOURCE_CITATION));
  const total = hits.reduce((s, e) => s + e.count, 0);
  const per10k = totalWords > 0 ? (total / totalWords) * 10000 : 0;
  const score = clamp(Math.round(Math.min(100, 20 + per10k * 9)), 0, 100);
  return {
    key: "source_citation",
    label: "Source citation",
    score,
    weight: 0,
    contribution: 0,
    explanation:
      total === 0
        ? `Across ${totalWords.toLocaleString()} transcript words, no explicit source attribution was found.`
        : `${total} source attributions across ${totalWords.toLocaleString()} transcript words (${per10k.toFixed(1)} per 10,000). ${
            score >= 60
              ? "Claims are routinely tied to studies, data, or named sources."
              : "Claims are mostly stated without pointing at evidence."
          }`,
    evidence: mergeEvidence(hits).slice(0, 8),
  };
}

function analyzeFalsifiability(
  units: Unit[],
  claims: ClaimInventory,
  coverage: TranscriptCoverage,
): FactorResult {
  const evidence: PhraseEvidence[] = [];
  if (coverage.videosWithTranscript > 0) {
    evidence.push(...countAll(units.map((u) => u.text).join("\n"), UNFALSIFIABLE).slice(0, 6));
  }
  const unfalsifiableHits = evidence.reduce((s, e) => s + e.count, 0);
  const totalWords = Math.max(1, units.reduce((s, u) => s + u.text.split(/\s+/).length, 0));
  const appealDensity = (unfalsifiableHits / totalWords) * 10000;

  // Falsifiable share of extracted claims, combined with appeal density.
  const falsifiable = claims.claims.length > 0 ? claims.falsifiableRatio : 0.5;
  const score = clamp(
    Math.round(falsifiable * 100 * 0.75 + clamp(100 - appealDensity * 14, 0, 100) * 0.25),
    0,
    100,
  );
  return {
    key: "falsifiability",
    label: "Falsifiability",
    score,
    weight: 0,
    contribution: 0,
    explanation:
      claims.claims.length === 0
        ? "No claims could be extracted from the sampled material."
        : `${(falsifiable * 100).toFixed(0)}% of ${claims.claims.length} extracted claims are falsifiable (measurable, causal, or predictive) rather than appeals to common sense. ${
            unfalsifiableHits > 0
              ? `${unfalsifiableHits} unfalsifiable appeal${unfalsifiableHits === 1 ? "" : "s"} detected.`
              : "No unfalsifiable appeals detected."
          }`,
    evidence,
  };
}

function verdictFor(score: number): Verdict {
  if (score >= 70) return "trusted";
  if (score >= 55) return "mostly_reliable";
  if (score >= 40) return "mixed";
  return "low_credibility";
}

function recommendationFor(verdict: Verdict, weakest: FactorResult | null, coverage: TranscriptCoverage): string {
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
  const parts: string[] = [];
  if (weakest && weakest.score < 50 && verdict !== "trusted") {
    parts.push(`Weakest area: ${weakest.label.toLowerCase()} (${weakest.score}/100).`);
  }
  if (coverage.status === "titles-only") {
    parts.push("This run had no transcripts, so spoken claims were not scored.");
  }
  return parts.length ? `${base[verdict]} ${parts.join(" ")}` : base[verdict];
}

function describeCoverage(units: Unit[]): TranscriptCoverage {
  const videosSampled = units.length;
  const withTranscript = units.filter((u) => u.transcript);
  const totalWords = withTranscript.reduce((s, u) => s + u.words, 0);
  const auto = withTranscript.filter((u) => u.transcript?.isAutoGenerated).length;
  const status: TranscriptCoverage["status"] =
    videosSampled === 0
      ? "titles-only"
      : withTranscript.length === 0
        ? "titles-only"
        : withTranscript.length >= Math.min(videosSampled, 8)
          ? "full"
          : "partial";
  return {
    status,
    videosWithTranscript: withTranscript.length,
    videosSampled,
    totalWords,
    autoGeneratedShare: withTranscript.length > 0 ? auto / withTranscript.length : 0,
    note:
      status === "titles-only"
        ? "No captions were available, so this report scores titles and descriptions only."
        : `Scored ${withTranscript.length} of ${videosSampled} sampled videos using ${totalWords.toLocaleString()} words of captions.`,
  };
}

/** Score each video on its own so a channel average cannot hide bad episodes. */
function scoreVideos(units: Unit[]): VideoOutlier[] {
  const scored = units.map((u) => {
    const all = u.text.toLowerCase();
    const flags: string[] = [];
    let penalty = 0;

    const abs = countAll(all, ABSOLUTE_CLAIMS).reduce((s, e) => s + e.count, 0);
    const consp = countAll(all, CONSPIRACY_MARKERS).reduce((s, e) => s + e.count, 0);
    const anger = countAll(all, CONTROVERSY_WORDS).reduce((s, e) => s + e.count, 0);
    const unfals = countAll(all, UNFALSIFIABLE).reduce((s, e) => s + e.count, 0);
    const sources = countAll(all, SOURCE_CITATION).reduce((s, e) => s + e.count, 0);

    penalty += Math.min(30, abs * 6);
    penalty += Math.min(25, consp * 10);
    penalty += Math.min(25, anger * 6);
    penalty += Math.min(20, unfals * 8);
    const words = Math.max(1, u.text.split(/\s+/).length);

    if (abs >= 2) flags.push("absolute claims");
    if (consp >= 1) flags.push("suppression narrative");
    if (anger >= 4) flags.push("outrage framing");
    if (unfals >= 1) flags.push("unfalsifiable appeal");
    if (sources >= 2) flags.push("cites sources");
    if (/(?:sponsored|affiliate|discount code|use my code)/i.test(u.video.description)) {
      flags.push("sponsored");
    }

    const lengthBonus = clamp(Math.round((Math.log10(words + 1) - 2) * 8), -10, 12);
    const score = clamp(Math.round(92 - penalty + lengthBonus + Math.min(10, sources * 3)), 0, 100);

    return { url: u.video.url, title: u.video.title, score, flags, publishedAt: u.video.publishedAt };
  });
  return scored;
}

export interface ChannelInput {
  channelTitle: string;
  videos: VideoSample[];
  transcripts?: Record<string, VideoTranscript>;
}

export function analyzeChannel(input: ChannelInput, weights?: Partial<EngineWeights>): EngineResult {
  const w: EngineWeights = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const videos = input.videos;
  const transcripts = input.transcripts ?? {};
  const units = buildUnits(videos, transcripts);
  const coverage = describeCoverage(units);
  const claims = extractClaims(videos, transcripts);

  const raw: Omit<FactorResult, "weight" | "contribution">[] = [
    analyzeClaimDiscipline(units),
    analyzeControversy(units),
    analyzeClickbait(units),
    analyzeSentiment(units),
    analyzeCadence(units),
    analyzeTransparency(units),
    analyzeSourceCitation(units),
    analyzeFalsifiability(units, claims, coverage),
  ];

  const weightByKey: Record<string, number> = {
    claim_discipline: w.claim_discipline,
    controversy_temperature: w.controversy_temperature,
    clickbait_pressure: w.clickbait_pressure,
    sentiment_balance: w.sentiment_balance,
    cadence_consistency: w.cadence_consistency,
    transparency: w.transparency,
    source_citation: w.source_citation,
    falsifiability: w.falsifiability,
  };

  const factors: FactorResult[] = raw.map((f) => {
    const weight = weightByKey[f.key] ?? 0;
    return { ...f, weight, contribution: Math.round(f.score * weight * 100) / 100 };
  });

  const score = clamp(Math.round(factors.reduce((s, f) => s + f.contribution, 0)), 0, 100);
  const verdict = verdictFor(score);
  const weakest = [...factors].sort((a, b) => a.score - b.score)[0] ?? null;

  const videoScores = scoreVideos(units);
  const meanVideo = videoScores.length
    ? videoScores.reduce((s, v) => s + v.score, 0) / videoScores.length
    : 0;
  const outliers = videoScores
    .filter((v) => v.score <= Math.max(35, meanVideo - 22))
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));

  // Attach per-video results so the UI can surface them without recomputing.
  for (const v of videos) {
    const hit = videoScores.find((s) => s.url === v.url);
    if (!hit) continue;
    v.perVideoScore = hit.score;
    v.perVideoFlags = hit.flags;
    v.transcriptAvailable = Boolean(transcripts[v.url]);
    v.transcriptWordCount = transcripts[v.url]?.wordCount ?? 0;
  }

  const allText = units.map((u) => u.text).join("\n");
  const titles = videos.map((v) => v.title).join("\n");

  return {
    version: ENGINE_VERSION,
    score,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    factors,
    signals: {
      claims: countAll(allText, ABSOLUTE_CLAIMS).slice(0, 10),
      controversy: countAll(allText, CONTROVERSY_WORDS).slice(0, 10),
      clickbait: countAll(titles, CLICKBAIT_PHRASES).slice(0, 10),
      positive: countAll(titles, POSITIVE_WORDS).slice(0, 10),
      negative: countAll(titles, NEGATIVE_WORDS).slice(0, 10),
      disclosures: countAll(allText, DISCLOSURE_MARKERS).slice(0, 10),
      sources: countAll(allText, SOURCE_CITATION).slice(0, 10),
      unfalsifiable: countAll(allText, UNFALSIFIABLE).slice(0, 10),
      corrections: countAll(allText, CORRECTIVE_HEDGING).slice(0, 10),
    },
    recommendation: recommendationFor(verdict, weakest, coverage),
    videoCount: videos.length,
    analyzedAt: new Date().toISOString(),
    weights: weightByKey,
    transcriptCoverage: coverage,
    outlierShare: videoScores.length ? outliers.length / videoScores.length : 0,
    outliers: outliers.slice(0, 8),
    claims,
  };
}
