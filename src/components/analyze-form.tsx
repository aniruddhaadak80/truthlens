"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const SAMPLES = ["@veritasium", "@kurzgesagt", "@TheLateShow"];

export function AnalyzeForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Analysis failed. Try another link.");
        return;
      }
      router.push(`/reports/${data.report.id}`);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "" : "w-full"}>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="analyze-url" className="sr-only">
          YouTube channel or video URL
        </label>
        <input
          id="analyze-url"
          className="input flex-1"
          placeholder="https://www.youtube.com/@handle — or paste any video link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          autoComplete="url"
          maxLength={500}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={loading || !url.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Analyzing…" : "Analyze channel"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
          {error}
        </p>
      )}
      {!compact && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="field-label">Try a sample</span>
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              className="chip transition-colors hover:border-phosphor/50 hover:text-phosphor"
              onClick={() => setUrl(`https://www.youtube.com/${s}`)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
