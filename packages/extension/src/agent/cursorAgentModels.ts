import { spawn } from "node:child_process";

import { buildEnvForAgentSpawn } from "./cursorCliSpawn";

const LIST_MODELS_TIMEOUT_MS = 15_000;

/** Runs `agent models` with the same env as headless spawn (API key from Colcoor secret when set). */
export function listCursorAgentModels(params: {
  executable: string;
  storedCursorApiKey?: string;
  timeoutMs?: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
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
        stdout,
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
