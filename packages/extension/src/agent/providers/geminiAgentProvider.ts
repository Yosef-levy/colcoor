import * as vscode from "vscode";

import { normalizePersistedUserInputText } from "../../conversation/normalizeUserInputText";
import { setCachedProviderCommands } from "../../commands/slash/providerCommandCatalog";
import {
  normalizeProviderMode,
  type ColcoorProviderUsage,
} from "../../conversation/messageProviderUsage";
import { withWorkspaceAgentSpawn } from "../cursorCliWorkspaceLock";
import { SECRET_GEMINI_API_KEY } from "../providerApiKey";
import { resolveRunModel } from "./anthropicConfig";
import { runGeminiAcpTurn, type GeminiAcpRunOptions } from "./geminiAcpClient";
import { resolveGeminiAgentModel } from "./geminiConfig";
import type { AgentBackend, AgentBackendRunInput, AgentRunResult } from "./types";

function promptForInput(input: AgentBackendRunInput): string {
  const plan = input.agentSession ?? { kind: "fresh" as const };
  const appendix = input.workspaceContextAppendix ?? "";
  const base =
    plan.kind === "fresh" || plan.kind === "fork"
      ? input.providerSlashCommand?.trim() || input.transcriptText
      : input.providerSlashCommand?.trim() || input.userMessage.trim() || input.transcriptText;
  return appendix ? `${base}${appendix}` : base;
}

function approvalMode(
  cliMode: AgentBackendRunInput["cliMode"],
  rawAutoApprove: string | undefined,
  disallowedTools: string[] | undefined,
): GeminiAcpRunOptions["approvalMode"] {
  if (cliMode === "plan" || disallowedTools?.length) return "plan";
  if (rawAutoApprove === "edits") return "autoEdit";
  if (rawAutoApprove === "all") return "yolo";
  return "default";
}

function usageFromAcp(
  result: Awaited<ReturnType<typeof runGeminiAcpTurn>>,
  mode: AgentBackendRunInput["cliMode"],
  model: string,
  durationMs: number,
): ColcoorProviderUsage {
  const meta = result.meta as
    | { quota?: { token_count?: { input_tokens?: number; output_tokens?: number } } }
    | undefined;
  const tokenCount = meta?.quota?.token_count;
  return {
    version: 1,
    provider: "gemini",
    backend: "gemini_cli_acp",
    mode: normalizeProviderMode(mode),
    model,
    stop_reason: result.stopReason,
    cancelled: result.cancelled || undefined,
    duration_ms: durationMs,
    tokens: {
      input: result.usage?.inputTokens ?? tokenCount?.input_tokens ?? 0,
      output: result.usage?.outputTokens ?? tokenCount?.output_tokens ?? 0,
      ...(result.usage?.cachedReadTokens != null
        ? { cache_read: result.usage.cachedReadTokens }
        : {}),
      ...(result.usage?.cachedWriteTokens != null
        ? { cache_creation: result.usage.cachedWriteTokens }
        : {}),
      ...(result.usage?.thoughtTokens != null ? { thinking: result.usage.thoughtTokens } : {}),
    },
    captured_at: new Date().toISOString(),
  };
}

export class GeminiAgentProvider implements AgentBackend {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async run(input: AgentBackendRunInput): Promise<AgentRunResult> {
    if (input.signal?.aborted) {
      return { text: "", stub: "explicit", cancelled: true, providerId: "gemini" };
    }
    const cfg = vscode.workspace.getConfiguration("colcoor");
    const executable = cfg.get<string>("geminiExecutable")?.trim() || "gemini";
    const model = resolveRunModel(input.cliModel, resolveGeminiAgentModel(cfg));
    const apiKey = (await this.secrets.get(SECRET_GEMINI_API_KEY))?.trim();
    const cwd = input.workspaceRoot.trim() || process.cwd();
    const plan = input.agentSession ?? { kind: "fresh" as const };
    const sessionId = plan.kind === "resume" ? plan.sessionId : undefined;
    const mode = approvalMode(
      input.cliMode,
      cfg.get<string>("geminiAutoApprove"),
      input.disallowedTools,
    );
    const startedAt = Date.now();

    try {
      const result = await withWorkspaceAgentSpawn(cwd, { resume: Boolean(sessionId) }, () =>
        runGeminiAcpTurn({
          executable,
          cwd,
          prompt: promptForInput(input),
          model,
          sessionId,
          approvalMode: mode,
          apiKey: apiKey || undefined,
          signal: input.signal,
          branchLabel: input.toolApprovalBranchLabel,
          allowPersistentOptions: mode !== "default" && mode !== "plan",
          onTextDelta: input.onTextDelta,
          onDisplayParts: input.onDisplayParts,
          onCommandsChanged: (commands) => {
            setCachedProviderCommands(cwd, commands, "gemini");
            input.onProviderCommandsChanged?.(commands);
          },
        }),
      );
      const text = normalizePersistedUserInputText(result.text);
      if (!text && !result.cancelled) throw new Error("Gemini CLI ACP returned an empty response.");
      return {
        text,
        stub: text ? "none" : "explicit",
        providerId: "gemini",
        cancelled: result.cancelled || undefined,
        agentTimeline: result.timeline.length ? result.timeline : undefined,
        agentDisplayParts: result.displayParts.length ? result.displayParts : undefined,
        cliModelId: model,
        providerSessionId: result.sessionId,
        providerUsage: usageFromAcp(result, input.cliMode, model, Date.now() - startedAt),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Colcoor (Gemini CLI ACP): ${message}`);
    }
  }
}
