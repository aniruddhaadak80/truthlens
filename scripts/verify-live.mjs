#!/usr/bin/env node

const BASE = process.argv[2] || process.env.TRUTHLENS_URL || "https://truthlens-virid.vercel.app";

let passed = 0;
let failed = 0;
let cookie = "";

// Reports are scoped to an anonymous HTTP-only session cookie, so every
// request in this verifier must carry the same cookie jar the browser uses.
async function call(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setCookie) {
    const pair = c.split(";")[0];
    if (pair.startsWith("tl_session=")) cookie = pair;
  }
  return res;
}

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name} ${detail}`);
  }
}

async function main() {
  console.log(`Verifying TruthLens at ${BASE}\n`);

  const res1 = await call(`/`);
  check("GET / returns 200", res1.status === 200, `got ${res1.status}`);
  const homeHtml = await res1.text();
  check(
    "home contains GitHub repo link",
    homeHtml.includes("github.com/aniruddhaadak80/truthlens"),
  );

  const res2 = await call(`/api/health`);
  const health = await res2.json();
  check("GET /api/health returns 200", res2.status === 200, `got ${res2.status}`);
  check("health reports real store check", health?.ok === true && health?.checks?.database === "up", JSON.stringify(health?.checks));

  const sampleUrl = "https://www.youtube.com/@veritasium";
  const res3 = await call(`/api/feed?url=${encodeURIComponent(sampleUrl)}`);
  const feed = await res3.json();
  check("GET /api/feed returns 200", res3.status === 200, `got ${res3.status}`);
  check(
    "feed returns non-empty normalized result with source metadata",
    Array.isArray(feed?.channel?.videos) &&
      feed.channel.videos.length > 0 &&
      typeof feed?.status === "string" &&
      typeof feed?.source === "string",
    JSON.stringify({ status: feed?.status, videos: feed?.channel?.videos?.length }),
  );

  const res4 = await call(`/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sampleUrl }),
  });
  const analyze = await res4.json();
  check("POST /api/analyze creates a report", res4.status === 201 && analyze?.report?.id, `got ${res4.status}`);
  const reportId = analyze?.report?.id;

  const engine = analyze?.engine;
  check(
    "engine returns versioned score, factors, recommendation, seal",
    typeof engine?.version === "string" &&
      typeof engine?.score === "number" &&
      Array.isArray(engine?.factors) &&
      engine.factors.length === 8 &&
      typeof engine?.recommendation === "string" &&
      typeof engine?.transcriptCoverage?.status === "string" &&
      Array.isArray(engine?.claims?.claims) &&
      typeof analyze?.audit?.seal === "string" &&
      analyze.audit.seal.length === 96,
    JSON.stringify({
      version: engine?.version,
      factors: engine?.factors?.length,
      coverage: engine?.transcriptCoverage?.status,
    }),
  );

  const res5 = await call(`/api/reports/${reportId}`);
  const readBack = await res5.json();
  check("GET /api/reports/[id] reads the record back", res5.status === 200 && readBack?.report?.id === reportId);

  const res6 = await call(`/api/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: "verified by live checker", user_verdict: "trusted" }),
  });
  const patched = await res6.json();
  check(
    "PATCH persists the update",
    res6.status === 200 && patched?.report?.note === "verified by live checker" && patched?.report?.user_verdict === "trusted",
  );

  const res7 = await call(`/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  const init = await res7.json();
  check("MCP initialize succeeds", res7.status === 200 && init?.result?.protocolVersion, JSON.stringify(init));

  const res8 = await call(`/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });
  const toolsList = await res8.json();
  const toolNames = toolsList?.result?.tools?.map((t) => t.name) ?? [];
  check(
    "MCP tools/list returns expected tools",
    ["analyze_channel", "get_report", "list_reports", "update_report_decision", "verify_integrity"].every((n) =>
      toolNames.includes(n),
    ),
    JSON.stringify(toolNames),
  );

  const res9 = await call(`/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "update_report_decision", arguments: { report_id: reportId, note: "mcp mutation proof", idempotency_key: `live-verify-${Date.now()}` } },
    }),
  });
  const mcpCall = await res9.json();
  check("MCP tools/call mutates through the same path", res9.status === 200 && mcpCall?.result?.structuredContent?.id === reportId, JSON.stringify(mcpCall?.error ?? mcpCall?.result));

  const res10 = await call(`/api/reports/${reportId}`);
  const afterMcp = await res10.json();
  check(
    "MCP mutation is persisted (read-back proves it)",
    afterMcp?.report?.note === "mcp mutation proof",
  );

  const idemKey = `live-verify-${reportId}`;
  const res10a = await call(`/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "update_report_decision", arguments: { report_id: reportId, note: "first write", idempotency_key: idemKey } },
    }),
  });
  await res10a.json();
  const res10b = await call(`/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "update_report_decision", arguments: { report_id: reportId, note: "second write", idempotency_key: idemKey } },
    }),
  });
  const idemResult = await res10b.json();
  check(
    "agent mutations are idempotent (replayed key does not double-apply)",
    idemResult?.result?.structuredContent?.id === reportId,
    JSON.stringify(idemResult?.error ?? idemResult?.result?.structuredContent),
  );
  const res10c = await call(`/api/reports/${reportId}`);
  const afterIdem = await res10c.json();
  check(
    "replayed idempotency key leaves the stored note unchanged",
    afterIdem?.report?.note === "first write",
    afterIdem?.report?.note,
  );

  const res11 = await call(`/api/verify?entity=${reportId}`);
  const verify = await res11.json();
  check("Integrity replay succeeds before deletion", res11.status === 200 && verify?.ok === true, JSON.stringify(verify));

  const resDrift = await call(`/api/drift?report=${reportId}`);
  const drift = await resDrift.json();
  check(
    "GET /api/drift returns a trend for the channel",
    resDrift.status === 200 && Array.isArray(drift?.points) && drift.points.length > 0,
    JSON.stringify({ points: drift?.points?.length, dir: drift?.direction }),
  );

  const resMcp8 = await call(`/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/list",
      params: {},
    }),
  });
  const allTools = (await resMcp8.json())?.result?.tools?.map((t) => t.name) ?? [];
  check(
    "MCP exposes the v2 tools (drift, compare, claims)",
    ["get_channel_drift", "compare_reports", "extract_claims"].every((n) => allTools.includes(n)),
    JSON.stringify(allTools),
  );

  const resClaims = await call(`/api/claims?url=${encodeURIComponent(sampleUrl)}`);
  const claims = await resClaims.json();
  check(
    "GET /api/claims returns a classified claim ledger",
    resClaims.status === 200 && Array.isArray(claims?.claims) && claims.claims.length > 0,
    JSON.stringify({ n: claims?.claims?.length, coverage: claims?.transcript_coverage?.status }),
  );

  const resCompare = await call(`/api/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ left_id: reportId, right_id: reportId }),
  });
  check(
    "POST /api/compare rejects a self-comparison",
    resCompare.status === 400,
    `got ${resCompare.status}`,
  );

  const res14 = await call(`/share/${reportId}`);
  const shareHtml = await res14.text();
  check("share route renders the report", res14.status === 200 && shareHtml.length > 1000, `got ${res14.status}`);

  const res12 = await call(`/api/reports/${reportId}`, { method: "DELETE" });
  check("DELETE removes the record", res12.status === 200);

  const res13 = await call(`/api/reports/${reportId}`);
  check("deleted record is absent", res13.status === 404, `got ${res13.status}`);

  const res15 = await call(`/reports`);
  const reportsHtml = await res15.text();
  check("reports route renders", res15.status === 200 && reportsHtml.length > 500, `got ${res15.status}`);

  const res16 = await call(`/agent`);
  check("agent route renders", res16.status === 200, `got ${res16.status}`);

  const res17 = await call(`/export`);
  check("export route renders", res17.status === 200, `got ${res17.status}`);

  const res18 = await call(`/settings`);
  check("settings route renders", res18.status === 200, `got ${res18.status}`);

  const res19 = await call(`/verify`);
  check("verify route renders", res19.status === 200, `got ${res19.status}`);

  const res20 = await fetch("https://github.com/aniruddhaadak80/truthlens");
  check("GitHub repository returns 200", res20.status === 200, `got ${res20.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Verifier crashed:", err);
  process.exit(1);
});
