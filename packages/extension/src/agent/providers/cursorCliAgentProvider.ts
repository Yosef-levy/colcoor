import * as vscode from "vscode";

import { normalizePersistedUserInputText } from "../../conversation/normalizeUserInputText";
import { SECRET_CURSOR_AGENT_API_KEY, URL_CURSOR_USER_API_KEYS } from "../cursorAgentApiKey";
import {
  normalizeAgentCliOutputMode,
  spawnCursorAgentPrint,
  type AgentCliOutputMode,
} from "../cursorCliSpawn";
import { resolveToolCallRejection } from "../cursorToolCallApproval";
import { stripAnsiSgr } from "../stripAnsi";
import type { AgentBackend, AgentBackendRunInput, AgentRunResult } from "./types";

/**
 * Legacy execution backend that runs Cursor's headless `agent -p`. Retained so the extension can be
 * used with a Cursor account, but no longer the default (see {@link resolveProviderId}).
 */
export class CursorCliAgentProvider implements AgentBackend {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    /** When true (auto mode), a missing `agent` binary degrades to a placeholder instead of throwing. */
    private readonly allowMissingExecutableFallback: boolean,
  ) {}

  async run(input: AgentBackendRunInput): Promise<AgentRunResult> {
    const config = vscode.workspace.getConfiguration("colcoor");
    const executable = (config.get<string>("agentExecutable") ?? "agent").trim() || "agent";
    const timeoutMs = Math.max(10_000, config.get<number>("agentTimeoutMs") ?? 300_000);
    const promptToolApproval = config.get<boolean>("agentPromptShellApproval") !== false;
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
          cliMode: input.cliMode,
          promptToolApproval,
          resolveToolRejection: promptToolApproval
            ? (rejection) =>
                resolveToolCallRejection(rejection, timeoutMs, input.userMessage, {
                  branchLabel: input.toolApprovalBranchLabel,
                })
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
        const authHint =
          /authentication|CURSOR_API_KEY|agent login/i.test(detail) || invalidKey
            ? '\n\nColcoor: Command Palette → "Colcoor: Set Cursor API key for agent" (replaces a bad CURSOR_API_KEY from the editor env), ' +
              `or create a key at ${URL_CURSOR_USER_API_KEYS}`
            : "";
        const envHint =
          invalidKey && !storedKey?.trim()
            ? "\n\nThe key came from the Cursor process environment (CURSOR_API_KEY). Unset it or set Colcoor’s key to override."
            : invalidKey && storedKey?.trim()
              ? "\n\nColcoor sent your stored key; create a new API key in Cursor if it is still rejected."
              : "";
        const flagHint =
          outputMode !== "text" &&
          /unknown flag|unrecognized|stream-partial|output-format/i.test(detail)
            ? '\n\nColcoor: Settings → search "Colcoor" → Agent: CLI output format — try "text" (final answer only) or "stream-json" if this agent build rejects streaming flags.'
            : "";
        throw new Error(
          `Cursor agent exited with code ${exitCode}.\n${detail}${envHint}${authHint}${flagHint}`,
        );
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
      if (this.allowMissingExecutableFallback && isMissingExecutableError(e)) {
        const u = normalizePersistedUserInputText(input.userMessage);
        const text =
          "[Colcoor] Cursor CLI (`agent`) not on PATH — placeholder reply only.\n\n" +
          `Your message:\n${u}`;
        input.onTextDelta?.(text);
        return { text, stub: "cli_missing" };
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Colcoor agent: ${msg}`);
    }
  }
}

function isMissingExecutableError(e: unknown): boolean {
  if (!e || typeof e !== "object") {
    return false;
  }
  const err = e as NodeJS.ErrnoException;
  return err.code === "ENOENT";
}
