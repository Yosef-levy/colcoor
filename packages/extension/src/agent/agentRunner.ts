/**
 * Dispatches a turn to the configured execution backend with Colcoor's authoritative transcript.
 * ask -> LLM API (e.g. Anthropic Messages); plan/agent -> agentic API (e.g. Claude Agent SDK);
 * Cursor headless CLI remains as a legacy backend. `stub` keeps offline / CI working.
 * @see docs/product/data-flow-and-api.md §2
 */

import * as vscode from "vscode";

import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";
import { normalizeCursorCliMode } from "./cursorCliMode";
import { selectAgentBackend } from "./providers/registry";
import type { AgentBackendRunInput, AgentRunResult, AssistantStubKind } from "./providers/types";

export type { AgentRunResult, AssistantStubKind } from "./providers/types";

export type AgentMode = "auto" | "headless" | "stub";

/** Public run input: the backend input plus nothing extra (kept as a named type for callers). */
export type AgentRunInput = AgentBackendRunInput;

export class AgentRunner {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const config = vscode.workspace.getConfiguration("colcoor");
    const rawMode = config.get<string>("agentMode") ?? "auto";
    const agentMode: AgentMode =
      rawMode === "headless" || rawMode === "stub" || rawMode === "auto" ? rawMode : "auto";
    const cliMode = normalizeCursorCliMode(input.cliMode);

    const selection = selectAgentBackend(this.secrets, { agentMode, cliMode });
    if (selection.kind === "stub") {
      if (input.signal?.aborted) {
        return { text: "", stub: "explicit", cancelled: true };
      }
      const out = stubBody(input.userMessage);
      input.onTextDelta?.(out.text);
      return out;
    }
    return selection.backend.run({ ...input, cliMode });
  }
}

function stubBody(userMessage: string): AgentRunResult {
  const u = normalizePersistedUserInputText(userMessage);
  return {
    text: "[Colcoor: stub mode]\n\n" + `You wrote:\n${u}`,
    stub: "explicit" as AssistantStubKind,
  };
}
