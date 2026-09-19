import * as vscode from "vscode";

import type { CursorCliMode } from "../cursorCliMode";
import { resolveProviderId } from "../providerApiKey";
import { AnthropicLlmProvider } from "./anthropicLlmProvider";
import { ClaudeAgentProvider } from "./claudeAgentProvider";
import { CursorCliAgentProvider } from "./cursorCliAgentProvider";
import { GeminiAgentProvider } from "./geminiAgentProvider";
import { GeminiLlmProvider } from "./geminiLlmProvider";
import type { AgentBackend, ProviderCapabilities, ProviderId } from "./types";
import { providerDescriptor } from "./providerDescriptors";

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
  if (provider === "gemini") {
    return {
      kind: "backend",
      backend:
        params.cliMode === "ask"
          ? new GeminiLlmProvider(secrets)
          : new GeminiAgentProvider(secrets),
    };
  }
  return {
    kind: "backend",
    backend:
      params.cliMode === "ask"
        ? new AnthropicLlmProvider(secrets)
        : new ClaudeAgentProvider(secrets),
  };
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
  return providerDescriptor(providerId).capabilities(params.cliMode, params.agentMode);
}
