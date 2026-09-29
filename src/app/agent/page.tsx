import { AgentConsole } from "@/components/agent-console";
import { siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agent console" };

export default function AgentPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="field-label mb-2">MCP · JSON-RPC 2.0</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agent console</h1>
          <p className="mt-1 max-w-2xl text-sm text-fog">
            Live tools backed by the same service layer as the UI. Endpoint:{" "}
            <code className="font-mono text-xs text-phosphor">POST /api/mcp</code> · manifest:{" "}
            <code className="font-mono text-xs text-phosphor">/mcp.json</code>
          </p>
        </div>
        <a
          href={`${siteConfig.liveUrl}/mcp.json`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost text-xs"
        >
          Open mcp.json
        </a>
      </div>
      <AgentConsole />
    </div>
  );
}
