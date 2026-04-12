/**
 * Invokes the Cursor agent with Colcoor's authoritative transcript + user message.
 * Prefer Cursor headless CLI (`agent -p`) when enabled; stub remains for offline / CI.
 * @see docs/data-flow-and-api.md §2
 */

import * as vscode from "vscode";
import { spawnCursorAgentPrint } from "./cursorCliSpawn";

/** VS Code secret for `CURSOR_API_KEY` when spawning `agent -p` (headless auth). */
export const SECRET_CURSOR_AGENT_API_KEY = "colcoor.cursorAgentApiKey";

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
      const extraEnv: Record<string, string> = {};
      if (storedKey?.trim()) {
        extraEnv.CURSOR_API_KEY = storedKey.trim();
      }

      const { stdout, stderr, exitCode } = await spawnCursorAgentPrint({
        executable,
        workspaceRoot: cwd,
        prompt: input.transcriptText,
        timeoutMs: Math.max(10_000, timeoutMs),
        extraEnv: Object.keys(extraEnv).length > 0 ? extraEnv : undefined,
      });
      if (exitCode !== 0) {
        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n---\n") || "(no output)";
        const authHint = /authentication|CURSOR_API_KEY|agent login/i.test(detail)
          ? '\n\nColcoor: Command Palette → "Colcoor: Set Cursor API key for agent" (stores key for agent -p), ' +
            "or run `agent login` in a terminal. Docs: https://cursor.com/docs/cli/reference/authentication"
          : "";
        throw new Error(`Cursor agent exited with code ${exitCode}.\n${detail}${authHint}`);
      }
      const text = stdout.trim();
      if (!text) {
        throw new Error(`Cursor agent returned empty stdout.${stderr ? `\n${stderr.trim()}` : ""}`);
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
