import * as vscode from "vscode";

/** Anthropic prompt-cache TTL. The API default dropped to 5m in 2026, so Colcoor sets this explicitly. */
export type PromptCacheTtl = "5m" | "1h";

export const DEFAULT_ASK_MODEL = "claude-sonnet-4-5";
export const DEFAULT_AGENT_MODEL = "claude-sonnet-4-5";
export const DEFAULT_PROMPT_CACHE_TTL: PromptCacheTtl = "1h";

export function normalizePromptCacheTtl(raw: string | undefined): PromptCacheTtl {
  return raw === "5m" ? "5m" : DEFAULT_PROMPT_CACHE_TTL;
}

export function resolveAskModel(cfg = vscode.workspace.getConfiguration("colcoor")): string {
  return cfg.get<string>("askModel")?.trim() || DEFAULT_ASK_MODEL;
}

export function resolveAgentModel(cfg = vscode.workspace.getConfiguration("colcoor")): string {
  return cfg.get<string>("agentModel")?.trim() || DEFAULT_AGENT_MODEL;
}

export function resolvePromptCacheTtl(
  cfg = vscode.workspace.getConfiguration("colcoor"),
): PromptCacheTtl {
  return normalizePromptCacheTtl(cfg.get<string>("promptCacheTtl"));
}
