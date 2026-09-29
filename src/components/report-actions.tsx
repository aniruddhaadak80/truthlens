"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, Loader2, Trash2 } from "lucide-react";
import type { ReportRow } from "@/lib/types";
import { VERDICTS } from "@/lib/verdicts";

const VERDICT_LABELS: Record<string, string> = {
  trusted: "Worth your time",
  mostly_reliable: "Mostly reliable",
  mixed: "Mixed signals",
  low_credibility: "Low credibility",
};

export function ReportActions({ report }: { report: ReportRow }) {
  const router = useRouter();
  const [note, setNote] = useState(report.note);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function saveNote() {
    setSavingNote(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? "Save failed");
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingNote(false);
    }
  }

  async function setVerdict(v: string) {
    setError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_verdict: v }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? "Update failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? "Delete failed");
      router.push("/reports");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function copyShareLink() {
    const url = `${window.location.origin}/share/${report.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="panel flex flex-col gap-5 p-5">
      <div>
        <label htmlFor="report-note" className="field-label mb-2 block">
          Your note
        </label>
        <textarea
          id="report-note"
          className="input min-h-20 resize-y"
          placeholder="Why you saved this channel, what you noticed, what you decided…"
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={saveNote} disabled={savingNote}>
            {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {noteSaved ? <Check className="h-3.5 w-3.5 text-mint" /> : null}
            {noteSaved ? "Saved" : "Save note"}
          </button>
          <span className="font-mono text-[0.6875rem] text-fog">{note.length}/2000</span>
        </div>
      </div>

      <div>
        <p className="field-label mb-2">Your verdict</p>
        <div className="flex flex-wrap gap-2">
          {VERDICTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVerdict(v)}
              aria-pressed={report.user_verdict === v}
              className={`chip cursor-pointer !px-3 !py-1.5 !text-xs transition-colors ${
                report.user_verdict === v
                  ? "border-phosphor/60 bg-phosphor/10 text-phosphor"
                  : "hover:text-snow"
              }`}
            >
              {VERDICT_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <a href={`/api/export/${report.id}`} className="btn-ghost !px-3 !py-1.5 text-xs" download>
          <Download className="h-3.5 w-3.5" />
          Export JSON
        </a>
        <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={copyShareLink}>
          {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy share link"}
        </button>
        {!confirmDelete ? (
          <button
            type="button"
            className="btn-danger !px-3 !py-1.5 text-xs ml-auto"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-rose">Delete this report?</span>
            <button type="button" className="btn-danger !px-3 !py-1.5 text-xs" onClick={doDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Confirm
            </button>
            <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}
