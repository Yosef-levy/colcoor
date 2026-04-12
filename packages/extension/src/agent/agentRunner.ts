/**
 * Invokes the Cursor agent with Colcoor's authoritative transcript + user message.
 * Prefer Cursor headless CLI (`agent -p`) when enabled; stub remains for offline / CI.
 * @see docs/data-flow-and-api.md §2
 */

import * as vscode from "vscode";
import { SECRET_CURSOR_AGENT_API_KEY } from "./cursorAgentApiKey";
import { spawnCursorAgentPrint } from "./cursorCliSpawn";

/** Strip ANSI SGR codes from CLI stderr (Cursor colors output). */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex -- match ESC [ … m from `agent` stderr
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export type AgentMode = "auto" | "headless" | "stub";

/** How the assistant body was produced (for UI; persisted text stays short when CLI is missing). */
export type AssistantStubKind = "none" | "explicit" | "cli_missing";

export type AgentRunResult = {
  text: string;
  stub: AssistantStubKind;
};

export class AgentRunner {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async run(input: {
    transcriptText: string;
    userMessage: string;
    workspaceRoot: string;
  }): Promise<AgentRunResult> {
    const config = vscode.workspace.getConfiguration("colcoor");
    const rawMode = config.get<string>("agentMode") ?? "auto";
    const mode: AgentMode =
      rawMode === "headless" || rawMode === "stub" || rawMode === "auto" ? rawMode : "auto";
    const executable = (config.get<string>("agentExecutable") ?? "agent").trim() || "agent";
    const timeoutMs = config.get<number>("agentTimeoutMs") ?? 300_000;
    const cwd = input.workspaceRoot.trim() || process.cwd();

    if (mode === "stub") {
      return stubBody(input.userMessage);
    }

    try {
      const storedKey = await this.secrets.get(SECRET_CURSOR_AGENT_API_KEY);

      const { stdout, stderr, exitCode } = await spawnCursorAgentPrint({
        executable,
        workspaceRoot: cwd,
        prompt: input.transcriptText,
        timeoutMs: Math.max(10_000, timeoutMs),
        storedCursorApiKey: storedKey?.trim() || undefined,
      });
      if (exitCode !== 0) {
        const raw = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n---\n") || "(no output)";
        const detail = stripAnsi(raw);
        const invalidKey = /invalid.*api key|api key is invalid/i.test(detail);
        const authHint = /authentication|CURSOR_API_KEY|agent login/i.test(detail) || invalidKey
          ? '\n\nColcoor: Command Palette → "Colcoor: Set Cursor API key for agent" (replaces a bad CURSOR_API_KEY from the editor env), ' +
            "or run `agent login` in a terminal. Docs: https://cursor.com/docs/cli/reference/authentication"
          : "";
        const envHint = invalidKey && !storedKey?.trim()
          ? "\n\nThe key came from the Cursor process environment (CURSOR_API_KEY). Unset it or set Colcoor’s key to override."
          : invalidKey && storedKey?.trim()
            ? "\n\nColcoor sent your stored key; create a new API key in Cursor if it is still rejected."
            : "";
        throw new Error(`Cursor agent exited with code ${exitCode}.\n${detail}${envHint}${authHint}`);
      }
      const text = stdout.trim();
      if (!text) {
        const errTail = stderr ? `\n${stripAnsi(stderr.trim())}` : "";
        throw new Error(`Cursor agent returned empty stdout.${errTail}`);
      }
      return { text, stub: "none" };
    } catch (e) {
      if (mode === "auto" && isMissingExecutableError(e)) {
        const u = input.userMessage.trim();
        return {
          text:
            "[Colcoor] Cursor CLI (`agent`) not on PATH — placeholder reply only.\n\n" +
            `Your message:\n${u}`,
          stub: "cli_missing",
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Colcoor agent: ${msg}`);
    }
  }
}

function stubBody(userMessage: string): AgentRunResult {
  return {
    text: "[Colcoor: stub mode]\n\n" + `You wrote:\n${userMessage.trim()}`,
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
