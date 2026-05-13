#!/usr/bin/env node
/**
 * Optional integration smoke test: spawns the bundled MCP server, calls the
 * `colcoor_health` tool, and confirms the response routes through to the
 * real backend at COLCOOR_BACKEND_URL.
 *
 * Run: COLCOOR_BACKEND_URL=http://127.0.0.1:8000 npm run smoke:integration
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const bundle = path.join(root, "dist", "server.js");

const BACKEND = process.env.COLCOOR_BACKEND_URL;
if (!BACKEND) {
  console.error("integration-smoke: COLCOOR_BACKEND_URL must be set.");
  process.exit(2);
}

await access(bundle).catch(() => {
  console.error(`integration-smoke: bundle missing at ${bundle} — run "npm run build" first.`);
  process.exit(2);
});

function jsonRpcRequest(id, method, params) {
  return `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
}

const proc = spawn(process.execPath, [bundle], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

proc.stderr.setEncoding("utf8");
proc.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

function readJsonRpc(stream) {
  let buf = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          resolve(JSON.parse(line));
        } catch (e) {
          reject(e);
        }
        stream.off("data", onData);
        return;
      }
    };
    stream.on("data", onData);
  });
}

async function send(req, label) {
  proc.stdin.write(req);
  const msg = await Promise.race([
    readJsonRpc(proc.stdout),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), 8000)),
  ]);
  return msg;
}

try {
  await send(
    jsonRpcRequest(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "colcoor-integration-smoke", version: "0.0.0" },
    }),
    "initialize",
  );

  const result = await send(
    jsonRpcRequest(2, "tools/call", {
      name: "colcoor_health",
      arguments: {},
    }),
    "tools/call colcoor_health",
  );

  const text = result.result?.content?.[0]?.text ?? "";
  console.log("integration-smoke: response:\n" + text);
  if (result.result?.isError) {
    console.error("integration-smoke: FAILED (tool returned isError=true).");
    proc.kill("SIGTERM");
    process.exit(1);
  }
  if (!text.includes("reachable")) {
    console.error("integration-smoke: FAILED (unexpected response).");
    proc.kill("SIGTERM");
    process.exit(1);
  }
  console.log("integration-smoke: PASS");
  proc.kill("SIGTERM");
  process.exit(0);
} catch (e) {
  console.error("integration-smoke: ERROR " + (e instanceof Error ? e.message : String(e)));
  proc.kill("SIGTERM");
  process.exit(1);
}
