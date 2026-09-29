export const siteConfig = {
  name: "TruthLens",
  tagline: "Is this creator worth your time?",
  description:
    "Paste any YouTube channel link. TruthLens refracts the channel's public video record into an evidence-backed credibility report — claim discipline, controversy temperature, clickbait pressure, sentiment balance, cadence, and transparency — scored by a deterministic, explainable engine.",
  repoUrl: "https://github.com/aniruddhaadak80/truthlens",
  liveUrl: "https://truthlens-virid.vercel.app",
  engineVersion: "2026.1.0",
} as const;

export const navLinks = [
  { href: "/", label: "Analyze" },
  { href: "/reports", label: "Reports" },
  { href: "/agent", label: "Agent" },
  { href: "/verify", label: "Verify" },
  { href: "/settings", label: "Settings" },
] as const;
