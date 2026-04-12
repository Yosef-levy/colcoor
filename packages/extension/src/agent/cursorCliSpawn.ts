import { spawn } from "node:child_process";

import { createStreamJsonStdoutFeed } from "./cursorAgentStreamJson";
import { processEnvForCursorCli } from "./agentPathEnv";

const MAX_CAPTURE_BYTES = 24 * 1024 * 1024;

/** Cursor `agent -p` stdout shape; see https://cursor.com/docs/cli/reference/output-format */
export type AgentCliOutputMode = "stream-json-partial" | "stream-json" | "text";

export function normalizeAgentCliOutputMode(raw: string | undefined): AgentCliOutputMode {
  if (raw === "text" || raw === "stream-json") {
    return raw;
  }
  return "stream-json-partial";
}

export function buildAgentPrintArgs(
  workspaceRoot: string,
  prompt: string,
  mode: AgentCliOutputMode,
): string[] {
  const cwd = workspaceRoot.trim() || process.cwd();
  const tail = ["--trust", "--workspace", cwd, prompt] as const;
  switch (mode) {
    case "text":
      return ["-p", "--output-format", "text", ...tail];
    case "stream-json":
      return ["-p", "--output-format", "stream-json", ...tail];
    default:
      return ["-p", "--output-format", "stream-json", "--stream-partial-output", ...tail];
  }
}

export type CursorCliSpawnResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** User cancelled via AbortSignal; stdout may contain partial output. */
  cancelled?: boolean;
};

/**
 * Child env for `agent`: PATH includes common install dirs. If Colcoor has a stored API key,
 * drop any inherited `CURSOR_API_KEY` from the editor process so the secret wins (stale env keys
 * often cause "invalid API key loaded from environment variable").
 */
export function buildEnvForAgentSpawn(storedCursorApiKey: string | undefined): NodeJS.ProcessEnv {
  const base = processEnvForCursorCli();
  const trimmed = storedCursorApiKey?.trim();
  if (!trimmed) {
    return base;
  }
  const rest = { ...base };
  delete rest.CURSOR_API_KEY;
  return { ...rest, CURSOR_API_KEY: trimmed };
}

/**
 * Runs `agent -p` (Cursor headless CLI) with the given prompt; cwd and `--workspace` are set.
 * @see https://cursor.com/docs/cli/headless
 */
export function spawnCursorAgentPrint(params: {
  executable: string;
  workspaceRoot: string;
  prompt: string;
  timeoutMs: number;
  /** When set, becomes the only `CURSOR_API_KEY` seen by `agent` (replaces editor env). */
  storedCursorApiKey?: string;
  /** When aborted, the child is killed and the promise resolves with `cancelled: true` and captured stdout. */
  signal?: AbortSignal;
  /** Called after each stdout chunk with full stdout captured so far (UTF-8). */
  onStdoutAccumulated?: (stdoutSoFar: string) => void;
  /** Defaults to stream-json + partial deltas. Use `text` if your `agent` build rejects streaming flags. */
  outputMode?: AgentCliOutputMode;
}): Promise<CursorCliSpawnResult> {
  const cwd = params.workspaceRoot.trim() || process.cwd();
  const env = buildEnvForAgentSpawn(params.storedCursorApiKey);
  const outputMode = params.outputMode ?? "stream-json-partial";
  const args = buildAgentPrintArgs(params.workspaceRoot, params.prompt, outputMode);
  const useJsonFeed = outputMode !== "text";

  if (params.signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(params.executable, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
    });

    const jsonFeed = useJsonFeed ? createStreamJsonStdoutFeed() : null;
    let rawStdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let killReason: null | "timeout" | "user_abort" | "oversized" = null;

    const onAbort = (): void => {
      if (settled) {
        return;
      }
      killReason = "user_abort";
      child.kill("SIGTERM");
    };
    if (params.signal) {
      params.signal.addEventListener("abort", onAbort, { once: true });
    }

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      killReason = "timeout";
      child.kill("SIGTERM");
    }, params.timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      params.signal?.removeEventListener("abort", onAbort);
    };

    const finish = (result: CursorCliSpawnResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const fail = (err: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(err);
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stdoutBytes += Buffer.byteLength(s, "utf8");
      if (stdoutBytes > MAX_CAPTURE_BYTES) {
        killReason = "oversized";
        child.kill("SIGTERM");
        fail(new Error("Cursor agent stdout exceeded Colcoor capture limit."));
        return;
      }
      rawStdout += s;
      if (jsonFeed) {
        jsonFeed.push(s, params.onStdoutAccumulated);
      } else {
        params.onStdoutAccumulated?.(rawStdout);
      }
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stderrBytes += Buffer.byteLength(s, "utf8");
      if (stderrBytes > MAX_CAPTURE_BYTES) {
        killReason = "oversized";
        child.kill("SIGTERM");
        fail(new Error("Cursor agent stderr exceeded Colcoor capture limit."));
        return;
      }
      stderr += s;
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      fail(err);
    });

    child.on("close", (exitCode, closeSignal) => {
      if (settled) {
        return;
      }
      let stdoutForResult: string;
      if (jsonFeed) {
        jsonFeed.flushTail(params.onStdoutAccumulated);
        const resolved = jsonFeed.getResolvedText();
        stdoutForResult = resolved || rawStdout;
      } else {
        stdoutForResult = rawStdout;
      }
      if (killReason === "user_abort") {
        finish({ stdout: stdoutForResult, stderr, exitCode: exitCode ?? null, cancelled: true });
        return;
      }
      if (killReason === "timeout") {
        fail(
          new Error(
            `Cursor agent timed out after ${params.timeoutMs}ms (Colcoor: colcoor.agentTimeoutMs).`,
          ),
        );
        return;
      }
      if (closeSignal) {
        fail(new Error(`Cursor agent terminated by signal ${closeSignal}.`));
        return;
      }
      finish({ stdout: stdoutForResult, stderr, exitCode: exitCode ?? null });
    });
  });
}
