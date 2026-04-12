#!/usr/bin/env node
/**
 * Layer-1 probe: how soon does `agent -p` emit stdout chunks?
 * Mirrors Colcoor's spawn argv (--output-format text, --trust, --workspace).
 *
 * Usage (from packages/extension):
 *   node scripts/agent-stream-latency.mjs
 *   node scripts/agent-stream-latency.mjs "your prompt"
 *   AGENT_EXECUTABLE=/abs/path/to/agent node scripts/agent-stream-latency.mjs
 *
 * Requires Cursor CLI on PATH (or AGENT_EXECUTABLE) and valid Cursor API auth
 * (same as running `agent` in a terminal).
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

function processEnvForCursorCli() {
  const sep = process.platform === "win32" ? ";" : ":";
  const h = homedir();
  let extra;
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    const dirs = [join(h, ".local", "bin")];
    if (local) {
      dirs.push(join(local, "Programs", "cursor"));
      dirs.push(join(local, "Programs", "Cursor"));
    }
    extra = dirs;
  } else {
    extra = [join(h, ".local", "bin"), join(h, ".cursor", "bin")];
  }
  const prefix = extra.join(sep);
  const base = process.env.PATH ?? "";
  const pathValue = prefix ? `${prefix}${sep}${base}` : base;
  return { ...process.env, PATH: pathValue };
}

const executable = (process.env.AGENT_EXECUTABLE ?? "agent").trim() || "agent";
const prompt = process.argv[2] ?? "tell me a short story";
const workspaceRoot = process.cwd();
const env = processEnvForCursorCli();

const args = [
  "-p",
  "--output-format",
  "text",
  "--trust",
  "--workspace",
  workspaceRoot,
  prompt,
];

const tSpawn = performance.now();
let firstChunkMs = null;
let lastChunkMs = null;
let chunkCount = 0;
let totalBytes = 0;
const timeoutMs = Number(process.env.AGENT_BENCH_TIMEOUT_MS ?? 180_000);

const child = spawn(executable, args, {
  cwd: workspaceRoot,
  env,
  shell: false,
  windowsHide: true,
});

const killTimer = setTimeout(() => {
  console.error(`timeout after ${timeoutMs}ms — sending SIGTERM to child`);
  child.kill("SIGTERM");
}, timeoutMs);

child.on("error", (err) => {
  clearTimeout(killTimer);
  console.error("spawn error:", err.message);
  process.exitCode = 1;
});

child.stdout?.on("data", (chunk) => {
  const now = performance.now();
  const n = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), "utf8");
  totalBytes += n;
  chunkCount += 1;
  if (firstChunkMs === null) {
    firstChunkMs = now - tSpawn;
  }
  lastChunkMs = now - tSpawn;
});

let stderr = "";
child.stderr?.on("data", (c) => {
  stderr += String(c);
});

child.on("close", (exitCode, signal) => {
  clearTimeout(killTimer);
  const tEnd = performance.now();
  const totalMs = tEnd - tSpawn;

  console.log(JSON.stringify({
    executable,
    promptPreview: prompt.slice(0, 80),
    workspaceRoot,
    exitCode,
    signal,
    chunkCount,
    totalBytes,
    ms_to_first_stdout_chunk: firstChunkMs,
    ms_to_last_stdout_chunk: lastChunkMs,
    ms_spawn_to_process_exit: Math.round(totalMs),
    /** If first and last chunk times are equal, stdout arrived in one burst from this process's view. */
    streaming_span_ms:
      firstChunkMs != null && lastChunkMs != null ? Math.round(lastChunkMs - firstChunkMs) : null,
  }, null, 2));

  if (stderr.trim()) {
    console.error("--- stderr (tail) ---\n", stderr.slice(-4000));
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode ?? 1;
  }
});
