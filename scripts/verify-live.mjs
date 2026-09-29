#!/usr/bin/env node

const BASE = process.argv[2] || process.env.TRUTHLENS_URL || "https://truthlens.vercel.app";

let passed = 0;
let failed = 0;

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

  const res1 = await fetch(`${BASE}/`);
  check("GET / returns 200", res1.status === 200, `got ${res1.status}`);
  const homeHtml = await res1.text();
  check(
    "home contains GitHub repo link",
    homeHtml.includes("github.com/aniruddhaadak80/truthlens"),
  );

  const res2 = await fetch(`${BASE}/api/health`);
  const health = await res2.json();
  check("GET /api/health returns 200", res2.status === 200, `got ${res2.status}`);
  check("health reports real store check", health?.ok === true && health?.checks?.database === "up", JSON.stringify(health?.checks));

  const sampleUrl = "https://www.youtube.com/@veritasium";
  const res3 = await fetch(`${BASE}/api/feed?url=${encodeURIComponent(sampleUrl)}`);
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

  const res4 = await fetch(`${BASE}/api/analyze`, {
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
      engine.factors.length === 6 &&
      typeof engine?.recommendation === "string" &&
      typeof analyze?.audit?.seal === "string" &&
      analyze.audit.seal.length === 96,
  );

  const res5 = await fetch(`${BASE}/api/reports/${reportId}`);
  const readBack = await res5.json();
  check("GET /api/reports/[id] reads the record back", res5.status === 200 && readBack?.report?.id === reportId);

  const res6 = await fetch(`${BASE}/api/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: "verified by live checker", user_verdict: "trusted" }),
  });
  const patched = await res6.json();
  check(
    "PATCH persists the update",
    res6.status === 200 && patched?.report?.note === "verified by live checker" && patched?.report?.user_verdict === "trusted",
  );

  const res7 = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  const init = await res7.json();
  check("MCP initialize succeeds", res7.status === 200 && init?.result?.protocolVersion, JSON.stringify(init));

  const res8 = await fetch(`${BASE}/api/mcp`, {
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

  const res9 = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "update_report_decision", arguments: { report_id: reportId, note: "mcp mutation proof", idempotency_key: "live-verify-key" } },
    }),
  });
  const mcpCall = await res9.json();
  check("MCP tools/call mutates through the same path", res9.status === 200 && mcpCall?.result?.structuredContent?.id === reportId, JSON.stringify(mcpCall?.error ?? mcpCall?.result));

  const res10 = await fetch(`${BASE}/api/reports/${reportId}`);
  const afterMcp = await res10.json();
  check(
    "MCP mutation is persisted (read-back proves it)",
    afterMcp?.report?.note === "mcp mutation proof",
  );

  const res11 = await fetch(`${BASE}/api/verify?entity=${reportId}`);
  const verify = await res11.json();
  check("Integrity replay succeeds before deletion", res11.status === 200 && verify?.ok === true, JSON.stringify(verify));

  const res12 = await fetch(`${BASE}/api/reports/${reportId}`, { method: "DELETE" });
  check("DELETE removes the record", res12.status === 200);

  const res13 = await fetch(`${BASE}/api/reports/${reportId}`);
  check("deleted record is absent", res13.status === 404, `got ${res13.status}`);

  const res14 = await fetch(`${BASE}/share/${reportId}`);
  const shareHtml = await res14.text();
  check("share route renders the report", res14.status === 200 && shareHtml.length > 1000, `got ${res14.status}`);

  const res15 = await fetch(`${BASE}/reports`);
  const reportsHtml = await res15.text();
  check("reports route renders", res15.status === 200 && reportsHtml.length > 500, `got ${res15.status}`);

  const res16 = await fetch(`${BASE}/agent`);
  check("agent route renders", res16.status === 200, `got ${res16.status}`);

  const res17 = await fetch(`${BASE}/export`);
  check("export route renders", res17.status === 200, `got ${res17.status}`);

  const res18 = await fetch(`${BASE}/settings`);
  check("settings route renders", res18.status === 200, `got ${res18.status}`);

  const res19 = await fetch(`${BASE}/verify`);
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
