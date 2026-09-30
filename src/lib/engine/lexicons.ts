export const ABSOLUTE_CLAIMS = [
  "proven", "proves", "proof", "guaranteed", "guarantee", "100%", "always", "never",
  "impossible", "undeniable", "irrefutable", "fact:", "science says", "studies show",
  "study shows", "research proves", "no doubt", "definitely", "the truth is",
];

export const CONSPIRACY_MARKERS = [
  "they don't want you to know", "what they don't tell you", "wake up", "sheeple",
  "mainstream media", "the media won't", "hidden truth", "the secret", "cover up",
  "cover-up", "big pharma", "deep state", "they are lying", "do your own research",
  "open your eyes", "what really happened", "the real truth", "they don't want",
  "what the media", "the establishment", "they don't want you to see",
];

export const CONTROVERSY_WORDS = [
  "destroyed", "destroy", "scam", "fraud", "liar", "lied", "worst", "disaster",
  "crisis", "war on", "debunked", "cancelled", "canceled", "exposed", "slammed",
  "blasts", "rips into", "shameful", "outrageous", "terrifying", "horrifying",
  "evil", "corrupt", "rigged", "stolen", "hoax", "conspiracy", "enemy of",
  "witch hunt", "smear", "disgrace", "pathetic", "clown", "fraudulent",
];

export const CLICKBAIT_PHRASES = [
  "you won't believe", "you wont believe", "shocking", "gone wrong", "gone viral",
  "what happened", "what happens next", "the real reason", "everything you need to know",
  "what no one", "no one talks about", "wait for it", "at the end", "this is why",
  "you need to see", "can't believe", "won't believe", "jaw dropping", "mind blowing",
  "top 5", "top 10", "top 3", "best 5", "worst 5", "number 1", "number one",
];

export const POSITIVE_WORDS = [
  "amazing", "wonderful", "excellent", "great", "love", "fantastic", "brilliant",
  "helpful", "thank", "thanks", "beautiful", "inspiring", "hope", "progress",
  "breakthrough", "celebrate", "win", "success", "improved", "better", "useful",
];

export const NEGATIVE_WORDS = [
  "terrible", "awful", "horrible", "hate", "worst", "bad", "fail", "failure",
  "disaster", "crisis", "danger", "threat", "fear", "warning", "alarming",
  "devastating", "tragic", "outrage", "angry", "furious", "broken", "toxic",
];

export const DISCLOSURE_MARKERS = [
  "sponsored", "sponsor", "affiliate", "paid promotion", "paid partnership",
  "partner", "discount code", "use my code", "in partnership", "ad:",
  "this video is sponsored", "contains affiliate",
];

/**
 * Spoken-content lexicons. These only apply when transcripts are available, so
 * the engine reports coverage instead of silently scoring a channel that
 * cannot be heard.
 */
export const SOURCE_CITATION = [
  "according to", "the study", "this study", "research shows", "researchers found",
  "the paper", "published in", "peer-reviewed", "journal", "data from", "dataset",
  "meta-analysis", "the authors", "their results", "our results", "we measured",
  "we ran", "i measured", "the experiment", "sample size", "control group",
  "statistically significant", "the source", "cited", "citation", "doi:",
  "preprint", "replication", "replicated",
];

export const UNFALSIFIABLE = [
  "everyone knows", "everyone agrees", "it's obvious", "obviously", "clearly",
  "common sense", "any one", "go figure", "trust me", "believe me", "wake up",
  "sheeple", "they don't want you to know", "the media won't", "mainstream media",
  "open your eyes", "do your own research", "think for yourself", "question everything",
  "follow the money", "it's a psyop", "they're lying", "cover-up", "cover up",
];

export const CORRECTIVE_HEDGING = [
  "i might be wrong", "i could be wrong", "i was wrong", "i stand corrected",
  "to be fair", "fair criticism", "i should clarify", "correction:",
  "actually, no", "let me correct", "that's not quite right", "i was too strong",
  "i overstated", "in hindsight", "fair point", "i take that back",
  "there's good evidence", "the evidence is mixed", "it's more complicated",
  "it depends", "that's an oversimplification", "i got that wrong",
];

