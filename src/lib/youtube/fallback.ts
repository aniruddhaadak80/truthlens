import type { NormalizedFeed, VideoSample } from "@/lib/types";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const SAMPLE_EXPLAINER = {
  channelTitle: "Sample: Field Notes Science",
  videos: [
    { title: "How coral reefs recover after bleaching events", description: "Field footage and a summary of the 2024 reef survey data. Sources linked in the pinned comment.", views: 412000, daysAgo: 3 },
    { title: "The physics of why bridges wobble", description: "A walkthrough of resonance with the Tacoma Narrows case study. References: openstax.org physics.", views: 287000, daysAgo: 10 },
    { title: "What the new exoplanet spectra actually show", description: "We read the JWST paper together and explain what the data supports and what it does not.", views: 534000, daysAgo: 17 },
    { title: "How vaccines are tested: the trial pipeline", description: "An overview of phase I-III trials with links to the published protocols.", views: 621000, daysAgo: 24 },
    { title: "Why the sky is blue (and sunset is red)", description: "Rayleigh scattering explained with simple experiments you can repeat at home.", views: 198000, daysAgo: 31 },
    { title: "The engineering behind reusable rockets", description: "Propulsion basics and what changed between 2015 and today. Sources: NASA technical reports.", views: 445000, daysAgo: 38 },
    { title: "Reading a climate graph without panic", description: "How to read anomaly charts, uncertainty ranges, and why error bars matter.", views: 356000, daysAgo: 45 },
    { title: "The math of fair voting systems", description: "Arrow's theorem explained with examples. This video is sponsored by Brilliant.org — link below.", views: 289000, daysAgo: 52 },
    { title: "How antibiotics resistance spreads", description: "Mechanisms of horizontal gene transfer, with citations to the primary literature.", views: 378000, daysAgo: 59 },
    { title: "What 'statistically significant' really means", description: "P-values, confidence intervals, and why replication matters. Textbook references included.", views: 512000, daysAgo: 66 },
    { title: "The chemistry of sourdough bread", description: "Fermentation, gluten networks, and the Maillard reaction — with a recipe that works.", views: 234000, daysAgo: 73 },
    { title: "How seismologists locate earthquakes", description: "Triangulation with seismic waves, explained with real USGS data from last month.", views: 301000, daysAgo: 80 },
    { title: "The history of the periodic table", description: "From Mendeleev's predictions to modern synthesis — a story of falsifiable science.", views: 267000, daysAgo: 87 },
    { title: "Why planes fly: lift, thrust, and drag", description: "Aerodynamics fundamentals with wind-tunnel footage. No sponsored content in this video.", views: 345000, daysAgo: 94 },
  ] as { title: string; description: string; views: number; daysAgo: number }[],
};

const SAMPLE_OUTRAGE = {
  channelTitle: "Sample: Breaking Point Daily",
  videos: [
    { title: "They DON'T Want You To See This!!", description: "Use code BREAKING for 15% off!!!", views: 892000, daysAgo: 1 },
    { title: "SHOCKING: The truth they are hiding from you", description: "Do your own research. Wake up sheeple.", views: 1204000, daysAgo: 2 },
    { title: "DESTROYED: The media won't show you this", description: "Mainstream media is lying to you. Share before it's deleted!!!", views: 743000, daysAgo: 4 },
    { title: "What they don't tell you about EVERYTHING", description: "The real truth about what is happening. Number 1 will shock you.", views: 967000, daysAgo: 6 },
    { title: "EXPOSED: The scam of the century", description: "This is 100% proven. They are corrupt and evil.", views: 1530000, daysAgo: 8 },
    { title: "You won't believe what they just did...", description: "Gone viral for a reason. Wait for the end.", views: 689000, daysAgo: 11 },
    { title: "The disaster they predicted is HERE", description: "Crisis. Disaster. Danger. Everything is falling apart!!!", views: 812000, daysAgo: 13 },
    { title: "HOAX? The lie they keep telling you", description: "Fraud. Scam. Liar. The worst thing ever is happening right now.", views: 1105000, daysAgo: 15 },
    { title: "RIGGED: The truth about the steal", description: "Stolen. Rigged. Corrupt. Open your eyes to the hidden truth.", views: 934000, daysAgo: 18 },
    { title: "TERRIFYING footage they tried to delete", description: "Terrifying. Horrifying. Alarming. The media won't cover this.", views: 1320000, daysAgo: 20 },
    { title: "The war on YOUR freedom", description: "War on everything you love. The establishment is coming for you.", views: 756000, daysAgo: 22 },
    { title: "BUSTED: Caught lying on camera", description: "Caught. Exposed. Slamed. The most pathetic thing you will see today.", views: 1048000, daysAgo: 25 },
    { title: "What really happened (they lied)", description: "The real truth about what really happened. Do your own research!!!", views: 881000, daysAgo: 27 },
    { title: "CANCELLED: The end of an era", description: "Cancelled. Disgrace. Shameful. This is why we can't have nice things.", views: 693000, daysAgo: 29 },
  ] as { title: string; description: string; views: number; daysAgo: number }[],
};

export function getFallbackFeed(input: string): NormalizedFeed {
  const h = hashString(input.toLowerCase());
  const sample = h % 2 === 0 ? SAMPLE_EXPLAINER : SAMPLE_OUTRAGE;
  const now = Date.now();
  const videos: VideoSample[] = sample.videos.map((v, i) => ({
    title: v.title,
    description: v.description,
    publishedAt: new Date(now - v.daysAgo * 86400000 - i * 3600000).toISOString(),
    views: v.views,
    url: `https://www.youtube.com/watch?v=sample${h % 2 === 0 ? "a" : "b"}${i}`,
    thumbnail: `https://i.ytimg.com/vi/sample${i}/hqdefault.jpg`,
  }));
  return {
    status: "fallback",
    source: "sealed-offline-sample",
    fetchedAt: new Date().toISOString(),
    channel: {
      channelId: `sample-${h % 2 === 0 ? "explainer" : "outrage"}`,
      channelTitle: sample.channelTitle,
      channelUrl: "https://www.youtube.com/",
      videos,
    },
    notice:
      "Live YouTube data could not be reached from this environment. Showing a sealed offline sample so the demo still works — re-run the analysis to retry the live feed. Sample data is never presented as a real channel.",
  };
}
