import {
  analyzeAndSave,
  updateReportDecision,
  verifyIntegrity,
  getDrift,
  compareReports,
} from "@/lib/service";
import { getRepository } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { fail, ok, readJson, requireString } from "@/lib/api-helpers";
import { siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "analyze_channel",
    description:
      "Analyze a YouTube channel or video URL and save a credibility report. Returns the report id, score, verdict, and factor breakdown.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "YouTube channel or video URL" },
      },
      required: ["url"],
    },
  },
  {
    name: "get_report",
    description: "Fetch a saved credibility report by id.",
    inputSchema: {
      type: "object",
      properties: {
        report_id: { type: "string", description: "Report id" },
      },
      required: ["report_id"],
    },
  },
  {
    name: "list_reports",
    description: "List recent credibility reports for the current session.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max reports (default 10, max 50)" },
      },
      required: [],
    },
  },
  {
    name: "update_report_decision",
    description:
      "Record your own verdict or a note on a report. Uses the same mutation path as the UI. Supports idempotency_key.",
    inputSchema: {
      type: "object",
      properties: {
        report_id: { type: "string" },
        user_verdict: {
          type: "string",
          enum: ["trusted", "mostly_reliable", "mixed", "low_credibility"],
        },
        note: { type: "string", description: "Your private note (max 2000 chars)" },
        idempotency_key: { type: "string", description: "Optional key to safely retry" },
      },
      required: ["report_id"],
    },
  },
  {
    name: "verify_integrity",
    description: "Replay the SHA-384 audit seal chain and report the first broken link, if any.",
    inputSchema: {
      type: "object",
      properties: {
        report_id: { type: "string", description: "Optional: verify only one report's events" },
      },
      required: [],
    },
  },
  {
    name: "get_channel_drift",
    description:
      "Read the credibility trend for a channel across past analyses: current score, direction, and the factor that moved most.",
    inputSchema: {
      type: "object",
      properties: {
        report_id: { type: "string", description: "Any report for the channel" },
        channel_id: { type: "string", description: "Or the channel id directly" },
      },
      required: [],
    },
  },
  {
    name: "compare_reports",
    description:
      "Compare two saved reports factor by factor and return the winner with the score gap.",
    inputSchema: {
      type: "object",
      properties: {
        left_id: { type: "string" },
        right_id: { type: "string" },
      },
      required: ["left_id", "right_id"],
    },
  },
  {
    name: "extract_claims",
    description:
      "Re-run the engine on a channel and return its claim ledger: extracted claims classified as empirical, causal, predictive, normative, or vague, with hedge and overclaim ratios.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "YouTube channel or video URL" },
      },
      required: ["url"],
    },
  },
];

function rpcError(id: unknown, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status: 200 });
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  sessionId: string,
): Promise<{ content: { type: "text"; text: string }[]; structuredContent?: unknown }> {
  switch (name) {
    case "analyze_channel": {
      const url = requireString(args.url, "url");
      const result = await analyzeAndSave(url, sessionId);
      return {
        content: [
          {
            type: "text",
            text: `Analyzed "${result.report.channel_title}" — score ${result.report.score}/100, verdict: ${result.report.verdict}. Report saved as ${result.report.id}.`,
          },
        ],
        structuredContent: {
          report_id: result.report.id,
          score: result.report.score,
          verdict: result.report.verdict,
          engine_version: result.report.engine_version,
          factors: result.report.factors.map((f) => ({
            key: f.key,
            label: f.label,
            score: f.score,
            weight: f.weight,
          })),
          seal: result.seal,
          url: `/reports/${result.report.id}`,
        },
      };
    }
    case "get_report": {
      const reportId = requireString(args.report_id, "report_id");
      const repo = await getRepository();
      const report = await repo.getReport(reportId, sessionId);
      if (!report) {
        return { content: [{ type: "text", text: `Report ${reportId} not found in this session.` }] };
      }
      return {
        content: [{ type: "text", text: `Report ${report.id} — ${report.channel_title}: ${report.score}/100 (${report.verdict}).` }],
        structuredContent: report,
      };
    }
    case "list_reports": {
      const limit = Math.min(Math.max(Number(args.limit ?? 10) || 10, 1), 50);
      const repo = await getRepository();
      const reports = await repo.listReports(sessionId, { limit });
      return {
        content: [{ type: "text", text: `${reports.length} report(s) in this session.` }],
        structuredContent: reports.map((r) => ({
          id: r.id,
          channel_title: r.channel_title,
          score: r.score,
          verdict: r.verdict,
          created_at: r.created_at,
          url: `/reports/${r.id}`,
        })),
      };
    }
    case "update_report_decision": {
      const reportId = requireString(args.report_id, "report_id");
      const note = args.note !== undefined ? requireString(args.note, "note", 2000) : undefined;
      const user_verdict =
        args.user_verdict !== undefined ? requireString(args.user_verdict, "user_verdict") : undefined;
      const idempotencyKey =
        args.idempotency_key !== undefined ? requireString(args.idempotency_key, "idempotency_key", 120) : undefined;
      const report = await updateReportDecision(
        reportId,
        sessionId,
        { note, user_verdict },
        idempotencyKey,
      );
      return {
        content: [{ type: "text", text: `Updated report ${report.id}.` }],
        structuredContent: {
          id: report.id,
          user_verdict: report.user_verdict,
          note: report.note,
          url: `/reports/${report.id}`,
        },
      };
    }
    case "verify_integrity": {
      const reportId = args.report_id !== undefined ? requireString(args.report_id, "report_id") : undefined;
      const result = await verifyIntegrity(reportId);
      return {
        content: [
          {
            type: "text",
            text: result.ok
              ? `Integrity chain verified: ${result.total} event(s) across ${result.entities ?? 1} entity chain(s), no broken links.`
              : `Integrity chain BROKEN at event ${result.firstBrokenId} of ${result.total}.`,
          },
        ],
        structuredContent: result,
      };
    }
    case "get_channel_drift": {
      const channelId = args.channel_id !== undefined ? requireString(args.channel_id, "channel_id") : undefined;
      let target = channelId;
      if (!target) {
        const reportId = requireString(args.report_id, "report_id");
        const repo = await getRepository();
        const report = await repo.getReport(reportId, sessionId);
        if (!report) {
          return { content: [{ type: "text", text: `Report ${reportId} not found in this session.` }] };
        }
        target = report.channel_id;
      }
      const drift = await getDrift(target);
      return {
        content: [{ type: "text", text: drift.summary }],
        structuredContent: drift,
      };
    }
    case "compare_reports": {
      const leftId = requireString(args.left_id, "left_id");
      const rightId = requireString(args.right_id, "right_id");
      const comparison = await compareReports(leftId, rightId, sessionId);
      return {
        content: [{ type: "text", text: comparison.summary }],
        structuredContent: comparison,
      };
    }
    case "extract_claims": {
      const url = requireString(args.url, "url");
      const { report, engine } = await analyzeAndSave(url, sessionId);
      return {
        content: [
          {
            type: "text",
            text: `Extracted ${engine.claims.claims.length} claims from ${engine.claims.analyzedUnits} units (${engine.claims.coverageLabel}). ${(engine.claims.falsifiableRatio * 100).toFixed(0)}% falsifiable, overclaim ratio ${(engine.claims.overclaimRatio * 100).toFixed(0)}%. Report saved as ${report.id}.`,
          },
        ],
        structuredContent: {
          report_id: report.id,
          transcript_coverage: engine.transcriptCoverage,
          coverage_label: engine.claims.coverageLabel,
          by_category: engine.claims.byCategory,
          hedge_ratio: engine.claims.hedgeRatio,
          overclaim_ratio: engine.claims.overclaimRatio,
          falsifiable_ratio: engine.claims.falsifiableRatio,
          claims: engine.claims.claims.slice(0, 15),
          url: `/reports/${report.id}`,
        },
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function POST(req: Request) {
  const rl = checkRateLimit(`mcp:${clientIp(req.headers)}`, 60, 60_000);
  if (!rl.ok) return fail(429, "rate_limited", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`);
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; code: string; message: string };
      return fail(e.status, e.code, e.message);
    }
    return fail(400, "invalid_json", "Request body must be valid JSON.");
  }

  const id = body.id ?? null;
  const method = typeof body.method === "string" ? body.method : "";
  const params = (body.params ?? {}) as Record<string, unknown>;

  if (method === "initialize") {
    return ok({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: siteConfig.name, version: siteConfig.engineVersion },
      },
    });
  }

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return new Response(null, { status: 202 });
  }

  if (method === "tools/list") {
    return ok({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }

  if (method === "tools/call") {
    const toolName = typeof params.name === "string" ? params.name : "";
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    if (!TOOLS.some((t) => t.name === toolName)) {
      return rpcError(id, -32602, `Unknown tool: ${toolName}`);
    }
    try {
      const sessionId = await getSessionId();
      const result = await handleToolCall(toolName, args, sessionId);
      return ok({ jsonrpc: "2.0", id, result });
    } catch (err) {
      if (err && typeof err === "object" && "status" in err) {
        const e = err as { status: number; code: string; message: string };
        return rpcError(id, -32603, `${e.code}: ${e.message}`);
      }
      return rpcError(id, -32603, "Internal tool error.");
    }
  }

  if (!method) return rpcError(id, -32600, "Invalid Request: missing method.");
  return rpcError(id, -32601, `Method not found: ${method}`);
}
