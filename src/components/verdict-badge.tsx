import { VERDICT_LABELS, type Verdict } from "@/lib/types";

const VERDICT_STYLES: Record<Verdict, string> = {
  trusted: "border-mint/40 bg-mint/10 text-mint",
  mostly_reliable: "border-phosphor/40 bg-phosphor/10 text-phosphor",
  mixed: "border-amber/40 bg-amber/10 text-amber",
  low_credibility: "border-rose/40 bg-rose/10 text-rose",
};

export function verdictColor(verdict: string): string {
  switch (verdict) {
    case "trusted":
      return "#34d399";
    case "mostly_reliable":
      return "#22d3ee";
    case "mixed":
      return "#fbbf24";
    default:
      return "#fb7185";
  }
}

export function VerdictBadge({ verdict, size = "md" }: { verdict: string; size?: "sm" | "md" }) {
  const label = VERDICT_LABELS[verdict as Verdict] ?? verdict;
  const style = VERDICT_STYLES[verdict as Verdict] ?? VERDICT_STYLES.mixed;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${style} ${
        size === "sm" ? "px-2 py-0.5 text-[0.6875rem]" : "px-3 py-1 text-xs"
      }`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: verdictColor(verdict) }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
