import type Anthropic from "@anthropic-ai/sdk";
import type { CursorCliMode } from "../agent/cursorCliMode";
import type { AgentSessionPlan } from "../agent/providers/types";
import type { PromptCacheTtl } from "../agent/providers/anthropicConfig";

export const COLOOR_PROVIDER_USAGE_KEY = "colcoor_provider_usage";

export type ProviderBackend = "messages_api" | "claude_agent_sdk" | "cursor_cli";
export type ProviderMode = "ask" | "plan" | "agent";
export type ContinuationKind = "fresh" | "resume" | "fork";

export type ColcoorProviderUsageTokens = {
  input: number;
  output: number;
  cache_read?: number;
  cache_creation?: number;
  cache_creation_5m?: number;
  cache_creation_1h?: number;
  thinking?: number;
};

export type ColcoorProviderUsage = {
  version: 1;
  provider: string;
  backend: ProviderBackend;
  mode: ProviderMode;
  model: string;
  message_id?: string;
  stop_reason?: string | null;
  cancelled?: boolean;
  continuation?: ContinuationKind;
  prompt_cache_ttl?: PromptCacheTtl;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  cost_usd?: number;
  tokens: ColcoorProviderUsageTokens;
  permission_denials?: number;
  captured_at: string;
};

export type SdkResultUsageCapture = {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_creation?: {
      ephemeral_5m_input_tokens?: number;
      ephemeral_1h_input_tokens?: number;
    } | null;
    output_tokens_details?: { thinking_tokens?: number } | null;
  };
  total_cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  stop_reason?: string | null;
  uuid?: string;
  permission_denials?: unknown[];
};

export function readColcoorProviderUsage(
  contentJson: Record<string, unknown> | null | undefined,
): ColcoorProviderUsage | undefined {
  if (!contentJson) {
    return undefined;
  }
  const raw = contentJson[COLOOR_PROVIDER_USAGE_KEY];
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) {
    return undefined;
  }
  const backend = o.backend;
  const mode = o.mode;
  const model = typeof o.model === "string" ? o.model.trim() : "";
  if (
    (backend !== "messages_api" && backend !== "claude_agent_sdk" && backend !== "cursor_cli") ||
    (mode !== "ask" && mode !== "plan" && mode !== "agent") ||
    !model
  ) {
    return undefined;
  }
  const tokensRaw = o.tokens;
  if (!tokensRaw || typeof tokensRaw !== "object") {
    return undefined;
  }
  const t = tokensRaw as Record<string, unknown>;
  const input = typeof t.input === "number" ? t.input : undefined;
  const output = typeof t.output === "number" ? t.output : undefined;
  if (input === undefined || output === undefined) {
    return undefined;
  }
  const tokens: ColcoorProviderUsageTokens = {
    input,
    output,
    ...(typeof t.cache_read === "number" ? { cache_read: t.cache_read } : {}),
    ...(typeof t.cache_creation === "number" ? { cache_creation: t.cache_creation } : {}),
    ...(typeof t.cache_creation_5m === "number" ? { cache_creation_5m: t.cache_creation_5m } : {}),
    ...(typeof t.cache_creation_1h === "number" ? { cache_creation_1h: t.cache_creation_1h } : {}),
    ...(typeof t.thinking === "number" ? { thinking: t.thinking } : {}),
  };
  const provider = typeof o.provider === "string" && o.provider.trim() ? o.provider.trim() : "anthropic";
  const captured_at =
    typeof o.captured_at === "string" && o.captured_at.trim() ? o.captured_at.trim() : "";
  if (!captured_at) {
    return undefined;
  }
  return {
    version: 1,
    provider,
    backend,
    mode,
    model,
    tokens,
    captured_at,
    ...(typeof o.message_id === "string" && o.message_id.trim() ? { message_id: o.message_id.trim() } : {}),
    ...(o.stop_reason === null || typeof o.stop_reason === "string" ? { stop_reason: o.stop_reason } : {}),
    ...(o.cancelled === true ? { cancelled: true } : {}),
    ...(o.continuation === "fresh" || o.continuation === "resume" || o.continuation === "fork"
      ? { continuation: o.continuation }
      : {}),
    ...(o.prompt_cache_ttl === "5m" || o.prompt_cache_ttl === "1h"
      ? { prompt_cache_ttl: o.prompt_cache_ttl }
      : {}),
    ...(typeof o.duration_ms === "number" ? { duration_ms: o.duration_ms } : {}),
    ...(typeof o.duration_api_ms === "number" ? { duration_api_ms: o.duration_api_ms } : {}),
    ...(typeof o.num_turns === "number" ? { num_turns: o.num_turns } : {}),
    ...(typeof o.cost_usd === "number" ? { cost_usd: o.cost_usd } : {}),
    ...(typeof o.permission_denials === "number" ? { permission_denials: o.permission_denials } : {}),
  };
}

export function buildProviderUsageJson(usage: ColcoorProviderUsage): Record<string, unknown> {
  return { [COLOOR_PROVIDER_USAGE_KEY]: usage };
}

export function normalizeProviderMode(cliMode: CursorCliMode | undefined): ProviderMode {
  if (cliMode === "plan" || cliMode === "agent") {
    return cliMode;
  }
  return "ask";
}

export function agentSessionToContinuation(
  plan: AgentSessionPlan | undefined,
): ContinuationKind | undefined {
  return plan?.kind;
}

function mapAnthropicUsage(usage: Anthropic.Usage): ColcoorProviderUsageTokens {
  const cacheCreation = usage.cache_creation;
  const thinking = usage.output_tokens_details?.thinking_tokens;
  return {
    input: usage.input_tokens,
    output: usage.output_tokens,
    ...(usage.cache_read_input_tokens != null ? { cache_read: usage.cache_read_input_tokens } : {}),
    ...(usage.cache_creation_input_tokens != null
      ? { cache_creation: usage.cache_creation_input_tokens }
      : {}),
    ...(cacheCreation?.ephemeral_5m_input_tokens != null
      ? { cache_creation_5m: cacheCreation.ephemeral_5m_input_tokens }
      : {}),
    ...(cacheCreation?.ephemeral_1h_input_tokens != null
      ? { cache_creation_1h: cacheCreation.ephemeral_1h_input_tokens }
      : {}),
    ...(thinking != null ? { thinking } : {}),
  };
}

function mapSdkUsage(usage: SdkResultUsageCapture["usage"]): ColcoorProviderUsageTokens {
  const u = usage ?? {};
  const cacheCreation = u.cache_creation;
  const thinking = u.output_tokens_details?.thinking_tokens;
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    ...(u.cache_read_input_tokens != null ? { cache_read: u.cache_read_input_tokens } : {}),
    ...(u.cache_creation_input_tokens != null
      ? { cache_creation: u.cache_creation_input_tokens }
      : {}),
    ...(cacheCreation?.ephemeral_5m_input_tokens != null
      ? { cache_creation_5m: cacheCreation.ephemeral_5m_input_tokens }
      : {}),
    ...(cacheCreation?.ephemeral_1h_input_tokens != null
      ? { cache_creation_1h: cacheCreation.ephemeral_1h_input_tokens }
      : {}),
    ...(thinking != null ? { thinking } : {}),
  };
}

export function providerUsageFromAnthropicMessage(
  message: Pick<Anthropic.Message, "id" | "model" | "stop_reason" | "usage">,
  opts: {
    mode: ProviderMode;
    promptCacheTtl?: PromptCacheTtl;
    cancelled?: boolean;
    durationMs?: number;
  },
): ColcoorProviderUsage {
  return {
    version: 1,
    provider: "anthropic",
    backend: "messages_api",
    mode: opts.mode,
    model: message.model.trim(),
    message_id: message.id.trim() || undefined,
    stop_reason: message.stop_reason,
    cancelled: opts.cancelled === true ? true : undefined,
    prompt_cache_ttl: opts.promptCacheTtl,
    duration_ms: opts.durationMs,
    tokens: mapAnthropicUsage(message.usage),
    captured_at: new Date().toISOString(),
  };
}

export function providerUsageFromSdkResult(
  result: SdkResultUsageCapture,
  opts: {
    mode: ProviderMode;
    model: string;
    continuation?: ContinuationKind;
    cancelled?: boolean;
  },
): ColcoorProviderUsage {
  const denials = Array.isArray(result.permission_denials) ? result.permission_denials.length : undefined;
  return {
    version: 1,
    provider: "anthropic",
    backend: "claude_agent_sdk",
    mode: opts.mode,
    model: opts.model.trim(),
    message_id: typeof result.uuid === "string" && result.uuid.trim() ? result.uuid.trim() : undefined,
    stop_reason: result.stop_reason ?? null,
    cancelled: opts.cancelled === true ? true : undefined,
    continuation: opts.continuation,
    duration_ms: result.duration_ms,
    duration_api_ms: result.duration_api_ms,
    num_turns: result.num_turns,
    cost_usd: result.total_cost_usd,
    permission_denials: denials,
    tokens: mapSdkUsage(result.usage),
    captured_at: new Date().toISOString(),
  };
}

export type ProviderUsagePersistContext = {
  cliMode?: CursorCliMode;
  agentSession?: AgentSessionPlan;
  promptCacheTtl?: PromptCacheTtl;
};

/** Merge provider usage from the run result with turn-level fields from the orchestrator. */
export function finalizeProviderUsage(
  runUsage: ColcoorProviderUsage | undefined,
  ctx: ProviderUsagePersistContext | undefined,
): ColcoorProviderUsage | undefined {
  if (!runUsage && !ctx?.cliMode && !ctx?.agentSession && !ctx?.promptCacheTtl) {
    return runUsage;
  }
  const mode = ctx?.cliMode
    ? normalizeProviderMode(ctx.cliMode)
    : (runUsage?.mode ?? normalizeProviderMode(undefined));
  const continuation = runUsage?.continuation ?? agentSessionToContinuation(ctx?.agentSession);
  const prompt_cache_ttl = runUsage?.prompt_cache_ttl ?? ctx?.promptCacheTtl;
  if (!runUsage) {
    return undefined;
  }
  return {
    ...runUsage,
    mode,
    ...(continuation ? { continuation } : {}),
    ...(prompt_cache_ttl ? { prompt_cache_ttl } : {}),
  };
}
