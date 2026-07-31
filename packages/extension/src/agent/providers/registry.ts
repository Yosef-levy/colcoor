import * as vscode from "vscode";

import { CURSOR_CLI_MODE_ASK, type CursorCliMode } from "../cursorCliMode";
import { resolveProviderId } from "../providerApiKey";
import { AnthropicLlmProvider } from "./anthropicLlmProvider";
import { ClaudeAgentProvider } from "./claudeAgentProvider";
import { CursorCliAgentProvider } from "./cursorCliAgentProvider";
import type { AgentBackend, ProviderCapabilities, ProviderId } from "./types";

export type BackendSelection = { kind: "stub" } | { kind: "backend"; backend: AgentBackend };

/**
 * Pick the execution backend for a turn from the configured supplier and the mode.
 * ask -> LLM (Messages API); plan/agent -> agentic (Claude Agent SDK); Cursor CLI is legacy.
 */
export function selectAgentBackend(
  secrets: vscode.SecretStorage,
  params: { agentMode: string; cliMode: CursorCliMode },
): BackendSelection {
  if (params.agentMode === "stub") {
    return { kind: "stub" };
  }
  const provider = resolveProviderId();
  if (provider === "cursor") {
    return {
      kind: "backend",
      backend: new CursorCliAgentProvider(secrets, params.agentMode === "auto"),
    };
  }
  if (params.cliMode === CURSOR_CLI_MODE_ASK) {
    return { kind: "backend", backend: new AnthropicLlmProvider(secrets) };
  }
  return { kind: "backend", backend: new ClaudeAgentProvider(secrets) };
}

/**
 * Capability matrix for slash commands and related features.
 * Depends on both provider and cli mode (not just {@link ProviderId}).
 */
export function resolveProviderCapabilities(params: {
  providerId?: ProviderId;
  agentMode: string;
  cliMode: CursorCliMode;
}): ProviderCapabilities {
  const providerId = params.providerId ?? resolveProviderId();
  if (params.agentMode === "stub") {
    return {
      supportsProviderCommands: false,
      supportsSkills: false,
      supportsProviderContext: false,
      supportsDisallowedTools: false,
      supportsSessionFork: false,
      supportsStructuredMessages: false,
      supportsDisplayParts: false,
    };
  }
  if (providerId === "cursor") {
    return {
      supportsProviderCommands: false,
      supportsSkills: false,
      supportsProviderContext: false,
      supportsDisallowedTools: false,
      supportsSessionFork: false,
      supportsStructuredMessages: false,
      supportsDisplayParts: true,
    };
  }
  if (params.cliMode === CURSOR_CLI_MODE_ASK) {
    return {
      supportsProviderCommands: false,
      supportsSkills: false,
      supportsProviderContext: false,
      supportsDisallowedTools: false,
      supportsSessionFork: false,
      supportsStructuredMessages: true,
      supportsDisplayParts: false,
    };
  }
  return {
    supportsProviderCommands: true,
    supportsSkills: true,
    supportsProviderContext: true,
    supportsDisallowedTools: true,
    supportsSessionFork: true,
    supportsStructuredMessages: false,
    supportsDisplayParts: false,
  };
}
