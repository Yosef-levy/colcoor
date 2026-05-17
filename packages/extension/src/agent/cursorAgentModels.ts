import { spawn } from "node:child_process";

import { buildEnvForAgentSpawn } from "./cursorCliSpawn";

const LIST_MODELS_TIMEOUT_MS = 15_000;

/**
 * Parse stdout from `agent models` / `agent --list-models` (one id per line; empty when unavailable).
 */
export function parseCursorAgentModelsStdout(stdout: string): string[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }
  if (/^no models available\b/i.test(trimmed) && !trimmed.includes("\n")) {
    return [];
  }
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return dedupeModelIds(
          parsed.filter((x): x is string => typeof x === "string").map((s) => s.trim()),
        );
      }
    } catch {
      /* fall through to line parsing */
    }
  }
  const models: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^no models available\b/i.test(t)) {
      continue;
    }
    const id = t.replace(/^[-*]\s+/, "").trim();
    if (id) {
      models.push(id);
    }
  }
  return dedupeModelIds(models);
}

function dedupeModelIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Runs `agent models` with the same env as headless spawn (API key from Colcoor secret when set). */
export function listCursorAgentModels(params: {
  executable: string;
  storedCursorApiKey?: string;
  timeoutMs?: number;
}): Promise<{ models: string[]; stderr: string; exitCode: number | null }> {
  const exe = params.executable.trim() || "agent";
  const env = buildEnvForAgentSpawn(params.storedCursorApiKey);
  const timeoutMs = Math.max(3_000, params.timeoutMs ?? LIST_MODELS_TIMEOUT_MS);

  return new Promise((resolve) => {
    const child = spawn(exe, ["models"], {
      env,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      child.kill("SIGTERM");
    }, timeoutMs);

    const finish = (exitCode: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        models: parseCursorAgentModelsStdout(stdout),
        stderr: stderr.trim(),
        exitCode,
      });
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code));
  });
}
