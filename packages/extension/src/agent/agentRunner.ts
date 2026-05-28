/**
 * Invokes the Cursor agent with Colcoor's authoritative transcript + user message.
 * Prefer Cursor headless CLI (`agent -p`) when enabled; stub remains for offline / CI.
 * @see docs/data-flow-and-api.md §2
 */

import * as vscode from "vscode";
import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";
import { SECRET_CURSOR_AGENT_API_KEY, URL_CURSOR_USER_API_KEYS } from "./cursorAgentApiKey";
import {
  normalizeAgentCliOutputMode,
  spawnCursorAgentPrint,
  type AgentCliOutputMode,
} from "./cursorCliSpawn";
import type { CursorAgentDisplayPart } from "./cursorAgentStreamJson";
import { resolveShellToolCallRejection } from "./cursorShellCommandApproval";
import { stripAnsiSgr } from "./stripAnsi";

export type AgentMode = "auto" | "headless" | "stub";

/** How the assistant body was produced (for UI; persisted text stays short when CLI is missing). */
export type AssistantStubKind = "none" | "explicit" | "cli_missing";

export type AgentRunResult = {
  text: string;
  stub: AssistantStubKind;
  /** Set when the user aborted the CLI run; `text` may be partial stdout. */
  cancelled?: boolean;
  /** Sanitized stream-json timeline for `assistant_output.content_json` (headless CLI only). */
  cursorCliTimeline?: unknown[];
  /** Structured assistant/activity display sequence (headless CLI stream-json only). */
  cursorCliDisplayParts?: CursorAgentDisplayPart[];
  /** Model id passed as `--model` or reported by the CLI init line when Automatic. */
  cliModelId?: string;
};

export class AgentRunner {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async run(input: {
    transcriptText: string;
    userMessage: string;
    workspaceRoot: string;
    /** Appended after the transcript for the CLI only (editor path, selection, git diff). */
    workspaceContextAppendix?: string;
    signal?: AbortSignal;
    /** Full assistant text so far (CLI stdout grows incrementally). Stub mode invokes once with the full body. */
    onTextDelta?: (textSoFar: string) => void;
    /** Structured assistant/activity display sequence while the Cursor CLI stream grows. */
    onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void;
    /** Cursor CLI `--model`; omit for automatic model selection. */
    cliModel?: string;
  }): Promise<AgentRunResult> {
    const config = vscode.workspace.getConfiguration("colcoor");
    const rawMode = config.get<string>("agentMode") ?? "auto";
    const mode: AgentMode =
      rawMode === "headless" || rawMode === "stub" || rawMode === "auto" ? rawMode : "auto";
    const executable = (config.get<string>("agentExecutable") ?? "agent").trim() || "agent";
    const timeoutMs = Math.max(10_000, config.get<number>("agentTimeoutMs") ?? 300_000);
    const promptShellApproval = config.get<boolean>("agentPromptShellApproval") !== false;
    const outputMode: AgentCliOutputMode = normalizeAgentCliOutputMode(
      config.get<string>("agentOutputFormat"),
    );
    const cwd = input.workspaceRoot.trim() || process.cwd();
    const appendix =
      input.workspaceContextAppendix == null
        ? ""
        : normalizePersistedUserInputText(input.workspaceContextAppendix);
    const promptForCli =
      appendix.length > 0 ? `${input.transcriptText}${appendix}` : input.transcriptText;

    if (mode === "stub") {
      if (input.signal?.aborted) {
        return { text: "", stub: "explicit", cancelled: true };
      }
      const out = stubBody(input.userMessage);
      input.onTextDelta?.(out.text);
      return out;
    }

    try {
      const storedKey = await this.secrets.get(SECRET_CURSOR_AGENT_API_KEY);

      const { stdout, stderr, exitCode, cancelled, ndjsonTimeline, displayParts, cliSessionModel } =
        await spawnCursorAgentPrint({
        executable,
        workspaceRoot: cwd,
        prompt: promptForCli,
        timeoutMs: Math.max(10_000, timeoutMs),
        storedCursorApiKey: storedKey?.trim() || undefined,
        signal: input.signal,
        onStdoutAccumulated: input.onTextDelta,
        onDisplayParts: input.onDisplayParts,
        outputMode,
        cliModel: input.cliModel?.trim() || undefined,
        promptShellApproval,
        resolveShellRejection: promptShellApproval
          ? (rejection) => resolveShellToolCallRejection(rejection, timeoutMs)
          : undefined,
      });
      const cliModelId = input.cliModel?.trim() || cliSessionModel?.trim() || undefined;
      if (cancelled) {
        return {
          text: normalizePersistedUserInputText(stdout),
          stub: "none",
          cancelled: true,
          cursorCliTimeline: ndjsonTimeline?.length ? ndjsonTimeline : undefined,
          cursorCliDisplayParts: displayParts?.length ? displayParts : undefined,
          cliModelId,
        };
      }
      if (exitCode !== 0) {
        const raw = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n---\n") || "(no output)";
        const detail = stripAnsiSgr(raw);
        const invalidKey = /invalid.*api key|api key is invalid/i.test(detail);
        const authHint = /authentication|CURSOR_API_KEY|agent login/i.test(detail) || invalidKey
          ? '\n\nColcoor: Command Palette → "Colcoor: Set Cursor API key for agent" (replaces a bad CURSOR_API_KEY from the editor env), ' +
            `or create a key at ${URL_CURSOR_USER_API_KEYS}`
          : "";
        const envHint = invalidKey && !storedKey?.trim()
          ? "\n\nThe key came from the Cursor process environment (CURSOR_API_KEY). Unset it or set Colcoor’s key to override."
          : invalidKey && storedKey?.trim()
            ? "\n\nColcoor sent your stored key; create a new API key in Cursor if it is still rejected."
            : "";
        const flagHint =
          outputMode !== "text" && /unknown flag|unrecognized|stream-partial|output-format/i.test(detail)
            ? '\n\nColcoor: Settings → search "Colcoor" → Agent: CLI output format — try "text" (final answer only) or "stream-json" if this agent build rejects streaming flags.'
            : "";
        throw new Error(`Cursor agent exited with code ${exitCode}.\n${detail}${envHint}${authHint}${flagHint}`);
      }
      const text = stdout.trim();
      if (!text) {
        const errTail = stderr ? `\n${stripAnsiSgr(stderr.trim())}` : "";
        throw new Error(`Cursor agent returned empty stdout.${errTail}`);
      }
      return {
        text,
        stub: "none",
        cursorCliTimeline: ndjsonTimeline?.length ? ndjsonTimeline : undefined,
        cursorCliDisplayParts: displayParts?.length ? displayParts : undefined,
        cliModelId,
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      if (mode === "auto" && isMissingExecutableError(e)) {
        const u = normalizePersistedUserInputText(input.userMessage);
        const text =
          "[Colcoor] Cursor CLI (`agent`) not on PATH — placeholder reply only.\n\n" +
          `Your message:\n${u}`;
        input.onTextDelta?.(text);
        return {
          text,
          stub: "cli_missing",
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Colcoor agent: ${msg}`);
    }
  }
}

function stubBody(userMessage: string): AgentRunResult {
  const u = normalizePersistedUserInputText(userMessage);
  return {
    text: "[Colcoor: stub mode]\n\n" + `You wrote:\n${u}`,
    stub: "explicit",
  };
}

function isMissingExecutableError(e: unknown): boolean {
  if (!e || typeof e !== "object") {
    return false;
  }
  const err = e as NodeJS.ErrnoException;
  return err.code === "ENOENT";
}
