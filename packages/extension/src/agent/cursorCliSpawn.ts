import { spawn } from "node:child_process";

import { processEnvForCursorCli } from "./agentPathEnv";
import { createStreamJsonStdoutFeed, type CursorAgentDisplayPart } from "./cursorAgentStreamJson";
import {
  parseShellToolCallRejection,
  type ShellToolCallRejection,
} from "./cursorShellToolCall";
import type { ShellRejectionResolution } from "./cursorShellCommandApproval";

const MAX_CAPTURE_BYTES = 24 * 1024 * 1024;
const MAX_SHELL_RESUME_ATTEMPTS = 5;

/** Cursor `agent -p` stdout shape; see https://cursor.com/docs/cli/reference/output-format */
export type AgentCliOutputMode = "stream-json-partial" | "stream-json" | "text";

export function normalizeAgentCliOutputMode(raw: string | undefined): AgentCliOutputMode {
  if (raw === "text" || raw === "stream-json") {
    return raw;
  }
  return "stream-json-partial";
}

function agentPrintTail(workspaceRoot: string, prompt: string): readonly string[] {
  const cwd = workspaceRoot.trim() || process.cwd();
  return ["--trust", "--workspace", cwd, prompt];
}

export function buildAgentPrintArgs(
  workspaceRoot: string,
  prompt: string,
  mode: AgentCliOutputMode,
  model?: string,
): string[] {
  const modelFlag = model?.trim() ? (["--model", model.trim()] as const) : [];
  const tail = agentPrintTail(workspaceRoot, prompt);
  switch (mode) {
    case "text":
      return ["-p", "--output-format", "text", ...modelFlag, ...tail];
    case "stream-json":
      return ["-p", "--output-format", "stream-json", ...modelFlag, ...tail];
    default:
      return ["-p", "--output-format", "stream-json", "--stream-partial-output", ...modelFlag, ...tail];
  }
}

export function buildAgentResumeArgs(
  workspaceRoot: string,
  sessionId: string,
  continuationPrompt: string,
  mode: AgentCliOutputMode,
  model?: string,
): string[] {
  const modelFlag = model?.trim() ? (["--model", model.trim()] as const) : [];
  const cwd = workspaceRoot.trim() || process.cwd();
  const tail = [
    "--trust",
    "--workspace",
    cwd,
    "--resume",
    sessionId.trim(),
    continuationPrompt,
  ] as const;
  switch (mode) {
    case "text":
      return ["-p", "--output-format", "text", ...modelFlag, ...tail];
    case "stream-json":
      return ["-p", "--output-format", "stream-json", ...modelFlag, ...tail];
    default:
      return ["-p", "--output-format", "stream-json", "--stream-partial-output", ...modelFlag, ...tail];
  }
}

type SpawnOnceResult = CursorCliSpawnResult & {
  sessionId?: string;
  shellRejection?: ShellToolCallRejection;
};

export type CursorCliSpawnResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** User cancelled via AbortSignal; stdout may contain partial output. */
  cancelled?: boolean;
  /** Present for stream-json modes: sanitized NDJSON objects in order (for `content_json`). */
  ndjsonTimeline?: unknown[];
  /** Assistant/activity sequence from stream-json, used to preserve UI segment boundaries. */
  displayParts?: CursorAgentDisplayPart[];
  /** From NDJSON `system` / `init` when streaming (actual model when `--model` omitted). */
  cliSessionModel?: string;
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

function mergeSpawnResults(base: CursorCliSpawnResult, next: CursorCliSpawnResult): CursorCliSpawnResult {
  const ndjsonTimeline = [...(base.ndjsonTimeline ?? []), ...(next.ndjsonTimeline ?? [])];
  const displayParts = [...(base.displayParts ?? []), ...(next.displayParts ?? [])];
  return {
    stdout: next.stdout || base.stdout,
    stderr: [base.stderr, next.stderr].filter(Boolean).join("\n"),
    exitCode: next.exitCode,
    cancelled: next.cancelled ?? base.cancelled,
    ndjsonTimeline: ndjsonTimeline.length ? ndjsonTimeline : undefined,
    displayParts: displayParts.length ? displayParts : undefined,
    cliSessionModel: next.cliSessionModel ?? base.cliSessionModel,
  };
}

function spawnCursorAgentPrintOnce(params: {
  executable: string;
  workspaceRoot: string;
  prompt: string;
  timeoutMs: number;
  storedCursorApiKey?: string;
  signal?: AbortSignal;
  onStdoutAccumulated?: (stdoutSoFar: string) => void;
  onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void;
  outputMode: AgentCliOutputMode;
  cliModel?: string;
  resumeSessionId?: string;
  detectShellRejections: boolean;
}): Promise<SpawnOnceResult> {
  const cwd = params.workspaceRoot.trim() || process.cwd();
  const env = buildEnvForAgentSpawn(params.storedCursorApiKey);
  const args = params.resumeSessionId?.trim()
    ? buildAgentResumeArgs(
        params.workspaceRoot,
        params.resumeSessionId.trim(),
        params.prompt,
        params.outputMode,
        params.cliModel,
      )
    : buildAgentPrintArgs(params.workspaceRoot, params.prompt, params.outputMode, params.cliModel);
  const useJsonFeed = params.outputMode !== "text";

  if (params.signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    let sessionId = params.resumeSessionId?.trim() || undefined;
    let shellRejection: ShellToolCallRejection | undefined;
    const child = spawn(params.executable, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
    });

    const jsonFeed = useJsonFeed
      ? createStreamJsonStdoutFeed({
          onNdjsonObject: params.detectShellRejections
            ? (o) => {
                if (typeof o.session_id === "string" && o.session_id.trim()) {
                  sessionId = o.session_id.trim();
                }
                if (shellRejection) {
                  return;
                }
                const rejection = parseShellToolCallRejection(o);
                if (!rejection) {
                  return;
                }
                shellRejection = {
                  ...rejection,
                  sessionId: rejection.sessionId ?? sessionId,
                };
                killReason = "shell_rejected";
                child.kill("SIGTERM");
              }
            : undefined,
        })
      : null;
    let rawStdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let killReason: null | "timeout" | "user_abort" | "oversized" | "shell_rejected" = null;

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

    const finish = (result: SpawnOnceResult): void => {
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
        jsonFeed.push(s, params.onStdoutAccumulated, params.onDisplayParts);
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
      let ndjsonTimeline: unknown[] | undefined;
      let displayParts: CursorAgentDisplayPart[] | undefined;
      let cliSessionModel: string | undefined;
      if (jsonFeed) {
        jsonFeed.flushTail(params.onStdoutAccumulated, params.onDisplayParts);
        const resolved = jsonFeed.getResolvedText();
        stdoutForResult = resolved || rawStdout;
        ndjsonTimeline = jsonFeed.getTimeline();
        displayParts = jsonFeed.getDisplayParts();
        cliSessionModel = jsonFeed.getSessionModel();
      } else {
        stdoutForResult = rawStdout;
      }
      if (killReason === "user_abort") {
        finish({
          stdout: stdoutForResult,
          stderr,
          exitCode: exitCode ?? null,
          cancelled: true,
          ndjsonTimeline,
          displayParts,
          cliSessionModel,
          sessionId,
          shellRejection,
        });
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
      if (closeSignal && killReason !== "shell_rejected") {
        fail(new Error(`Cursor agent terminated by signal ${closeSignal}.`));
        return;
      }
      finish({
        stdout: stdoutForResult,
        stderr,
        exitCode: exitCode ?? null,
        ndjsonTimeline,
        displayParts,
        cliSessionModel,
        sessionId,
        shellRejection,
      });
    });
  });
}

/**
 * Runs `agent -p` (Cursor headless CLI) with the given prompt; cwd and `--workspace` are set.
 * When stream-json reports a rejected shell command, optionally prompts the user (Run / Skip /
 * Add to allowlist), updates ~/.cursor/cli-config.json on allowlist, and resumes the CLI session.
 * @see https://cursor.com/docs/cli/headless
 */
export async function spawnCursorAgentPrint(params: {
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
  /** Called when the structured assistant/activity display sequence changes. */
  onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void;
  /** Defaults to stream-json + partial deltas. Use `text` if your `agent` build rejects streaming flags. */
  outputMode?: AgentCliOutputMode;
  /** When set, passed as `--model` (omit for Cursor default / automatic). */
  cliModel?: string;
  /** When true (default), detect shell rejections and invoke `resolveShellRejection`. */
  promptShellApproval?: boolean;
  /** Resolve a rejected shell command (Run / Skip / Add to allowlist). */
  resolveShellRejection?: (rejection: ShellToolCallRejection) => Promise<ShellRejectionResolution>;
}): Promise<CursorCliSpawnResult> {
  const outputMode = params.outputMode ?? "stream-json-partial";
  const detectShellRejections =
    params.promptShellApproval !== false &&
    outputMode !== "text" &&
    Boolean(params.resolveShellRejection);
  let merged: CursorCliSpawnResult = {
    stdout: "",
    stderr: "",
    exitCode: null,
  };
  let prompt = params.prompt;
  let resumeSessionId: string | undefined;
  let resumeAttempts = 0;

  while (true) {
    const once = await spawnCursorAgentPrintOnce({
      executable: params.executable,
      workspaceRoot: params.workspaceRoot,
      prompt,
      timeoutMs: params.timeoutMs,
      storedCursorApiKey: params.storedCursorApiKey,
      signal: params.signal,
      onStdoutAccumulated: params.onStdoutAccumulated,
      onDisplayParts: params.onDisplayParts,
      outputMode,
      cliModel: params.cliModel,
      resumeSessionId,
      detectShellRejections,
    });
    merged = mergeSpawnResults(merged, once);

    if (
      !detectShellRejections ||
      !once.shellRejection ||
      once.cancelled ||
      params.signal?.aborted
    ) {
      return merged;
    }

    const resolution = await params.resolveShellRejection!(once.shellRejection);

    const nextSessionId = once.shellRejection.sessionId ?? once.sessionId;
    if (!nextSessionId?.trim()) {
      return merged;
    }

    resumeAttempts += 1;
    if (resumeAttempts > MAX_SHELL_RESUME_ATTEMPTS) {
      throw new Error(
        "Colcoor: too many shell approval resumes in one agent run. Adjust Cursor CLI allowlist or retry.",
      );
    }

    resumeSessionId = nextSessionId.trim();
    prompt = resolution.continuationPrompt;
  }
}
