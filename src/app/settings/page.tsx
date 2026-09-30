"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2 } from "lucide-react";
import type { EngineWeights } from "@/lib/types";
import { FACTOR_BLURBS, FACTOR_LABELS } from "@/lib/types";

type WeightKey = keyof EngineWeights;

const FACTOR_META: { key: WeightKey; label: string; hint: string }[] = (
  Object.keys(FACTOR_LABELS) as WeightKey[]
).map((key) => ({ key, label: FACTOR_LABELS[key], hint: FACTOR_BLURBS[key] }));

export default function SettingsPage() {
  const router = useRouter();
  const [weights, setWeights] = useState<EngineWeights | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((d) => setWeights(d.weights))
      .catch(() => setMessage("Could not load settings."));
  }, []);

  const total = weights
    ? FACTOR_META.reduce((s, f) => s + (weights[f.key] || 0), 0)
    : 0;

  async function save() {
    if (!weights) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? "Save failed");
      setMessage("Weights saved — they apply to your next analysis.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    setClearing(true);
    try {
      const res = await fetch("/api/session", { method: "DELETE" });
      if (!res.ok) throw new Error("Clear failed");
      setMessage("All reports in this session were deleted.");
      setConfirmClear(false);
      router.refresh();
    } catch {
      setMessage("Clear failed");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="field-label mb-2">Configuration</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
      <p className="mt-1 text-sm text-fog">
        Calibrate the engine to your standards. Weights are stored per session and apply to every
        new analysis you run.
      </p>

      <div className="mt-8">
        {!weights ? (
          <div className="panel h-40 animate-pulse" />
        ) : (
          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <p className="field-label">Engine weights</p>
              <span className={`font-mono text-xs ${Math.abs(total - 1) < 0.01 ? "text-mint" : "text-amber"}`}>
                Σ {total.toFixed(2)}
              </span>
            </div>
            <div className="mt-5 flex flex-col gap-5">
              {FACTOR_META.map((f) => (
                <div key={f.key}>
                  <div className="flex items-center justify-between">
                    <label htmlFor={`w-${f.key}`} className="text-xs font-medium text-snow">
                      {f.label}
                      <span className="ml-2 font-normal text-fog">{f.hint}</span>
                    </label>
                    <span className="font-mono text-xs text-phosphor">
                      {Math.round((weights[f.key] || 0) * 100)}%
                    </span>
                  </div>
                  <input
                    id={`w-${f.key}`}
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.01}
                    value={weights[f.key] || 0}
                    onChange={(e) =>
                      setWeights({ ...weights, [f.key]: Number(e.target.value) })
                    }
                    className="mt-2 w-full accent-cyan-400"
                    aria-label={`${f.label} weight`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button type="button" className="btn-primary !py-2 text-xs" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save weights
              </button>
              {message && <p className="text-xs text-fog">{message}</p>}
            </div>
            {Math.abs(total - 1) >= 0.01 && (
              <p className="mt-3 text-xs text-amber">
                Weights should sum to 1.00 for comparable scores — currently {total.toFixed(2)}.
              </p>
            )}
          </div>
        )}

        <div className="panel mt-4 border-rose/30 p-6">
          <p className="field-label !text-rose">Danger zone</p>
          <p className="mt-2 text-xs text-fog">
            Permanently delete every report in this browser session. The audit trail records the
            deletion itself.
          </p>
          {!confirmClear ? (
            <button type="button" className="btn-danger mt-4 !py-2 text-xs" onClick={() => setConfirmClear(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete all my reports
            </button>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <button type="button" className="btn-danger !py-2 text-xs" onClick={clearAll} disabled={clearing}>
                {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Yes, delete everything
              </button>
              <button type="button" className="btn-ghost !py-2 text-xs" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
