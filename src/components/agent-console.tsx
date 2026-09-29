"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Play } from "lucide-react";

interface RpcEntry {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  response?: unknown;
  error?: boolean;
  at: string;
}

const QUICK_CALLS = [
  { label: "initialize", method: "initialize", params: {} },
  { label: "tools/list", method: "tools/list", params: {} },
  {
    label: "analyze @veritasium",
    method: "tools/call",
    params: { name: "analyze_channel", arguments: { url: "https://www.youtube.com/@veritasium" } },
  },
  { label: "list reports", method: "tools/call", params: { name: "list_reports", arguments: { limit: 5 } } },
  { label: "verify integrity", method: "tools/call", params: { name: "verify_integrity", arguments: {} } },
];

const TOOL_NAMES = ["analyze_channel", "get_report", "list_reports", "update_report_decision", "verify_integrity"];

export function AgentConsole() {
  const [entries, setEntries] = useState<RpcEntry[]>([]);
  const [tool, setTool] = useState(TOOL_NAMES[0]);
  const [args, setArgs] = useState('{\n  "url": "https://www.youtube.com/@kurzgesagt"\n}');
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<string[]>([]);
  const idRef = useRef(0);

  async function call(method: string, params: Record<string, unknown>) {
    setBusy(true);
    idRef.current += 1;
    const id = idRef.current;
    const entry: RpcEntry = { id, method, params, at: new Date().toLocaleTimeString() };
    setEntries((prev) => [entry, ...prev].slice(0, 30));
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
      const data = await res.json();
      if (data.error) {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, response: data.error, error: true } : e)),
        );
      } else {
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, response: data.result } : e)));
        if (method === "tools/list" && data.result?.tools) {
          setTools(data.result.tools.map((t: { name: string }) => t.name));
        }
      }
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, response: { message: err instanceof Error ? err.message : "Network error" }, error: true } : e,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function reportUrlFrom(entry: RpcEntry): string | null {
    const sc = (entry.response as { structuredContent?: { url?: string } } | undefined)
      ?.structuredContent;
    if (sc && typeof sc.url === "string" && sc.url.startsWith("/reports/")) {
      return sc.url;
    }
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-4">
        <div className="panel p-5">
          <p className="field-label mb-3">One-click calls</p>
          <div className="flex flex-col gap-2">
            {QUICK_CALLS.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={busy}
                onClick={() => call(q.method, q.params)}
                className="btn-ghost justify-between !py-2 text-left text-xs"
              >
                <span className="font-mono">{q.label}</span>
                <Play className="h-3.5 w-3.5 text-phosphor" />
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <p className="field-label mb-3">Custom tool call</p>
          <label htmlFor="mcp-tool" className="sr-only">Tool name</label>
          <select
            id="mcp-tool"
            className="input mb-3 !py-2 text-xs"
            value={tool}
            onChange={(e) => setTool(e.target.value)}
          >
            {TOOL_NAMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label htmlFor="mcp-args" className="sr-only">Tool arguments JSON</label>
          <textarea
            id="mcp-args"
            className="input min-h-28 resize-y font-mono !text-xs"
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            spellCheck={false}
          />
          <button
            type="button"
            className="btn-primary mt-3 w-full !py-2 text-xs"
            disabled={busy}
            onClick={() => {
              try {
                call("tools/call", { name: tool, arguments: JSON.parse(args) });
              } catch {
                setEntries((prev) => [
                  {
                    id: Date.now(),
                    method: "tools/call",
                    response: { message: "Arguments must be valid JSON." },
                    error: true,
                    at: new Date().toLocaleTimeString(),
                  },
                  ...prev,
                ]);
              }
            }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Send tools/call
          </button>
        </div>

        {tools.length > 0 && (
          <div className="panel p-5">
            <p className="field-label mb-2">Discovered tools</p>
            <ul className="flex flex-col gap-1">
              {tools.map((t) => (
                <li key={t} className="font-mono text-xs text-mint">{t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="panel flex min-h-[480px] flex-col p-5">
        <p className="field-label mb-3">Request / response log</p>
        {entries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <p className="max-w-xs text-xs leading-relaxed text-fog">
              Send a call and the raw JSON-RPC 2.0 request and response will appear here. Mutations
              go through the same service layer as the UI.
            </p>
          </div>
        ) : (
          <ul className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {entries.map((e) => {
              const reportUrl = reportUrlFrom(e);
              return (
                <li key={e.id} className="panel-inset p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-mono text-[0.6875rem] ${e.error ? "text-rose" : "text-phosphor"}`}>
                      {e.method}
                    </span>
                    <span className="font-mono text-[0.6875rem] text-fog">{e.at}</span>
                  </div>
                  {e.params && Object.keys(e.params).length > 0 && (
                    <pre className="mt-2 overflow-x-auto rounded bg-ink p-2 font-mono text-[0.6875rem] leading-relaxed text-fog">
                      {JSON.stringify(e.params, null, 2)}
                    </pre>
                  )}
                  <pre
                    className={`mt-2 overflow-x-auto rounded p-2 font-mono text-[0.6875rem] leading-relaxed ${
                      e.error ? "bg-rose/10 text-rose" : "bg-ink text-snow"
                    }`}
                  >
                    {JSON.stringify(e.response, null, 2)}
                  </pre>
                  {reportUrl && (
                    <Link
                      href={reportUrl}
                      className="mt-2 inline-flex items-center gap-1 font-mono text-[0.6875rem] text-phosphor hover:underline"
                    >
                      View persisted report →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
