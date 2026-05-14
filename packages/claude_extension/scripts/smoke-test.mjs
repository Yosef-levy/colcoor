#!/usr/bin/env node
/**
 * Smoke test for the Claude Desktop Extension.
 *
 * 1. Verifies that the bundle exists under dist/.
 * 2. Spawns the bundled MCP server with a stubbed COLCOOR_BACKEND_URL.
 * 3. Sends `initialize`, `notifications/initialized`, `tools/list`, `resources/list`,
 *    and `resources/read` for the `ui://` MCP App shell — then SIGTERM.
 *
 * No real backend is required; this confirms the bundle, transport, and
 * tool registration all load cleanly. Use `npm run test` for unit tests.
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const bundle = path.join(root, "dist", "server.js");

async function ensureBundle() {
  try {
    await access(bundle);
  } catch {
    console.error(`smoke: missing ${path.relative(root, bundle)} — run "npm run build" first.`);
    process.exit(2);
  }
}

function jsonRpcRequest(id, method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  return `${body}\n`;
}

function readJsonRpcLines(stream, onMessage) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        onMessage(JSON.parse(line));
      } catch {
        // Ignore lines that aren't JSON (shouldn't happen on the JSON-RPC channel).
      }
    }
  });
}

async function main() {
  await ensureBundle();

  // Provide a clearly invalid backend URL so no real network calls are made,
  // but pass the env var so the server start does not fail.
  const env = {
    ...process.env,
    COLCOOR_BACKEND_URL: process.env.COLCOOR_BACKEND_URL ?? "http://127.0.0.1:0",
    COLCOOR_API_TOKEN: process.env.COLCOOR_API_TOKEN ?? "",
    COLCOOR_CURSOR_ACCESS_TOKEN: "",
  };

  const proc = spawn(process.execPath, [bundle], {
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });

  const stderrLines = [];
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk) => {
    stderrLines.push(chunk.toString());
    process.stderr.write(`[server] ${chunk}`);
  });

  const responses = [];
  const waitFor = (predicate, timeoutMs) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new Error(`smoke: timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const onMsg = (msg) => {
        responses.push(msg);
        if (predicate(msg)) {
          clearTimeout(t);
          resolve(msg);
        }
      };
      readJsonRpcLines(proc.stdout, onMsg);
    });

  // Initialize handshake.
  proc.stdin.write(
    jsonRpcRequest(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "colcoor-smoke-test", version: "0.0.0" },
    }),
  );

  let initResponse;
  try {
    initResponse = await waitFor((m) => m.id === 1, 8000);
  } catch (e) {
    proc.kill("SIGTERM");
    console.error(`smoke: did not get initialize response: ${e.message}`);
    process.exit(1);
  }

  if (initResponse.error) {
    console.error(`smoke: initialize returned error: ${JSON.stringify(initResponse.error)}`);
    proc.kill("SIGTERM");
    process.exit(1);
  }

  if (!initResponse.result || typeof initResponse.result !== "object") {
    console.error(`smoke: initialize response missing result: ${JSON.stringify(initResponse)}`);
    proc.kill("SIGTERM");
    process.exit(1);
  }

  proc.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }) + "\n",
  );

  // Ask for the tool list.
  proc.stdin.write(jsonRpcRequest(2, "tools/list", {}));

  let toolsResponse;
  try {
    toolsResponse = await waitFor((m) => m.id === 2, 5000);
  } catch (e) {
    proc.kill("SIGTERM");
    console.error(`smoke: did not get tools/list response: ${e.message}`);
    process.exit(1);
  }

  if (toolsResponse.error) {
    proc.kill("SIGTERM");
    console.error(`smoke: tools/list error: ${JSON.stringify(toolsResponse.error)}`);
    process.exit(1);
  }

  const tools = toolsResponse.result?.tools ?? [];
  console.log(`smoke: server initialized OK; exposed ${tools.length} tool(s):`);
  for (const t of tools) {
    console.log(`  - ${t.name}`);
  }

  if (tools.length < 10) {
    console.error(`smoke: expected at least 10 tools, got ${tools.length}`);
    proc.kill("SIGTERM");
    process.exit(1);
  }

  const explorer = tools.find((t) => t.name === "colcoor_open_conversation_explorer");
  if (!explorer || !explorer._meta?.ui?.resourceUri) {
    console.error("smoke: colcoor_open_conversation_explorer missing or lacks _meta.ui.resourceUri");
    proc.kill("SIGTERM");
    process.exit(1);
  }

  proc.stdin.write(jsonRpcRequest(3, "resources/list", {}));

  let resourcesResponse;
  try {
    resourcesResponse = await waitFor((m) => m.id === 3, 5000);
  } catch (e) {
    proc.kill("SIGTERM");
    console.error(`smoke: did not get resources/list response: ${e.message}`);
    process.exit(1);
  }

  if (resourcesResponse.error) {
    proc.kill("SIGTERM");
    console.error(`smoke: resources/list error: ${JSON.stringify(resourcesResponse.error)}`);
    process.exit(1);
  }

  const resources = resourcesResponse.result?.resources ?? [];
  const uiRes = resources.find((r) => String(r.uri || "").startsWith("ui://"));
  if (!uiRes) {
    console.error("smoke: expected at least one ui:// resource in resources/list");
    proc.kill("SIGTERM");
    process.exit(1);
  }

  proc.stdin.write(
    jsonRpcRequest(4, "resources/read", {
      uri: uiRes.uri,
    }),
  );

  let readResponse;
  try {
    readResponse = await waitFor((m) => m.id === 4, 8000);
  } catch (e) {
    proc.kill("SIGTERM");
    console.error(`smoke: did not get resources/read response: ${e.message}`);
    process.exit(1);
  }

  if (readResponse.error) {
    proc.kill("SIGTERM");
    console.error(`smoke: resources/read error: ${JSON.stringify(readResponse.error)}`);
    process.exit(1);
  }

  const contents = readResponse.result?.contents ?? [];
  const html = contents[0];
  if (!html || !String(html.text || "").includes("Colcoor conversation explorer")) {
    proc.kill("SIGTERM");
    console.error("smoke: resources/read did not return expected HTML document");
    process.exit(1);
  }

  if (String(html.mimeType || "") !== "text/html;profile=mcp-app") {
    proc.kill("SIGTERM");
    console.error(`smoke: unexpected UI mimeType: ${html.mimeType}`);
    process.exit(1);
  }

  console.log(`smoke: resources OK; ui resource ${uiRes.uri} (${contents.length} content block(s))`);

  proc.kill("SIGTERM");
  console.log("smoke: PASS");
}

main().catch((e) => {
  console.error(`smoke: failed — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
