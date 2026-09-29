export interface VideoSample {
  title: string;
  description: string;
  publishedAt: string;
  views: number;
  url: string;
  thumbnail?: string;
}

export interface ChannelFeed {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  videos: VideoSample[];
}

export type FeedStatus = "live" | "fallback";

export interface NormalizedFeed {
  status: FeedStatus;
  source: string;
  fetchedAt: string;
  channel: ChannelFeed;
  notice?: string;
}

export type Verdict = "trusted" | "mostly_reliable" | "mixed" | "low_credibility";

export interface PhraseEvidence {
  phrase: string;
  count: number;
}

export interface FactorResult {
  key: string;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  explanation: string;
  evidence: PhraseEvidence[];
}

export interface EngineSignals {
  claims: PhraseEvidence[];
  controversy: PhraseEvidence[];
  clickbait: PhraseEvidence[];
  positive: PhraseEvidence[];
  negative: PhraseEvidence[];
  disclosures: PhraseEvidence[];
}

export interface EngineResult {
  version: string;
  score: number;
  verdict: Verdict;
  verdictLabel: string;
  factors: FactorResult[];
  signals: EngineSignals;
  recommendation: string;
  videoCount: number;
  analyzedAt: string;
  weights: Record<string, number>;
}

export interface ReportRow {
  id: string;
  session_id: string;
  channel_title: string;
  channel_handle: string;
  channel_id: string;
  source_url: string;
  video_count: number;
  engine_version: string;
  score: number;
  verdict: string;
  factors: FactorResult[];
  signals: EngineSignals;
  sample_videos: VideoSample[];
  feed_status: FeedStatus;
  note: string;
  user_verdict: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuditRow {
  id: number;
  session_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: Record<string, unknown>;
  seal: string;
  created_at: string;
}

export interface AuditEventInput {
  session_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface EngineWeights {
  claim_discipline: number;
  controversy_temperature: number;
  clickbait_pressure: number;
  sentiment_balance: number;
  cadence_consistency: number;
  transparency: number;
}

export const DEFAULT_WEIGHTS: EngineWeights = {
  claim_discipline: 0.25,
  controversy_temperature: 0.2,
  clickbait_pressure: 0.15,
  sentiment_balance: 0.1,
  cadence_consistency: 0.15,
  transparency: 0.15,
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  trusted: "Worth your time",
  mostly_reliable: "Mostly reliable",
  mixed: "Mixed signals",
  low_credibility: "Low credibility",
};
