#!/usr/bin/env node
/**
 * Optional auth-failure integration check: spawns the bundled MCP server,
 * calls `colcoor_list_conversations` without a token, and confirms the
 * server surfaces a clear 401 error envelope.
 *
 * Run: COLCOOR_BACKEND_URL=http://127.0.0.1:18765 node scripts/integration-smoke-auth.mjs
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bundle = path.resolve(__dirname, "..", "dist", "server.js");

const BACKEND = process.env.COLCOOR_BACKEND_URL;
if (!BACKEND) {
  console.error("COLCOOR_BACKEND_URL must be set");
  process.exit(2);
}

const proc = spawn(process.execPath, [bundle], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, COLCOOR_API_TOKEN: "definitely-not-a-real-jwt" },
});
proc.stderr.setEncoding("utf8");
proc.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

function send(id, method, params) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === id) {
            proc.stdout.off("data", onData);
            resolve(msg);
            return;
          }
        } catch {
          /* skip */
        }
      }
    };
    proc.stdout.on("data", onData);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    setTimeout(() => reject(new Error(`timeout id=${id}`)), 8000);
  });
}

try {
  await send(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "auth-smoke", version: "0" },
  });
  const r = await send(2, "tools/call", {
    name: "colcoor_list_conversations",
    arguments: {},
  });
  const text = r.result?.content?.[0]?.text ?? "";
  console.log("auth-smoke: response:\n" + text);
  if (!r.result?.isError) {
    console.error("auth-smoke: FAILED — expected isError but got success.");
    proc.kill("SIGTERM");
    process.exit(1);
  }
  // A bogus JWT + dev backend without DB returns 401 (auth check first) or 503
  // (when DB layer is unconfigured). Either proves the MCP server propagated
  // the backend HTTP error through to a structured tool envelope.
  if (!/HTTP (?:401|403|503)/.test(text)) {
    console.error(
      "auth-smoke: FAILED — expected HTTP 401/403/503 in error text (got: " + text + ").",
    );
    proc.kill("SIGTERM");
    process.exit(1);
  }
  console.log("auth-smoke: PASS");
  proc.kill("SIGTERM");
  process.exit(0);
} catch (e) {
  console.error("auth-smoke: ERROR " + (e instanceof Error ? e.message : String(e)));
  proc.kill("SIGTERM");
  process.exit(1);
}
