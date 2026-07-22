import type { CursorCliMode } from "../cursorCliMode";
import type { CursorAgentDisplayPart } from "../cursorAgentStreamJson";
import type { ColcoorProviderUsage } from "../../conversation/messageProviderUsage";

/** How the assistant body was produced (for UI; persisted text stays short when execution is unavailable). */
export type AssistantStubKind = "none" | "explicit" | "cli_missing";

export type AgentRunResult = {
  text: string;
  stub: AssistantStubKind;
  /** Set when the user aborted the run; `text` may be partial output. */
  cancelled?: boolean;
  /** Sanitized stream-json timeline for `assistant_output.content_json` (Cursor CLI only). */
  cursorCliTimeline?: unknown[];
  /** Structured assistant/activity display sequence (Cursor CLI stream-json only). */
  cursorCliDisplayParts?: CursorAgentDisplayPart[];
  /** Model id reported by the backend (Cursor `--model`, CLI init line, or provider model). */
  cliModelId?: string;
  /** Provider agent session id to persist for resume/fork (plan/agent backends). */
  providerSessionId?: string;
  /** Provider message id of the last message in the session, used as a fork anchor. */
  providerMessageId?: string;
  /** Token/cost/latency envelope for the metadata popup (`colcoor_provider_usage`). */
  providerUsage?: ColcoorProviderUsage;
};

/** Base64 image part for Messages API vision (ask path). */
export type LlmImagePart = {
  mimeType: string;
  dataBase64: string;
};

/** One role-tagged turn for the stateless chat (ask) path. */
export type LlmMessage = {
  role: "user" | "assistant";
  content: string;
  /**
   * Hydrated image bytes for Anthropic vision blocks. Present only on user turns after
   * `hydrateLlmRequestImages`; ignored by plan/agent/CLI backends.
   */
  images?: LlmImagePart[];
};

/** Structured request for a stateless LLM completion (ask mode). */
export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
};

/**
 * Continuation plan for a stateful agent backend (plan/agent mode). Computed by the turn
 * orchestrator from the branch the new message attaches to.
 */
export type AgentSessionPlan =
  | { kind: "fresh" }
  | { kind: "resume"; sessionId: string }
  | { kind: "fork"; sessionId: string; upToMessageId?: string };

export type AgentBackendRunInput = {
  /** Full authoritative transcript; used as the prompt for fresh agent sessions and the Cursor CLI. */
  transcriptText: string;
  /** The new user message for this turn (plain text). */
  userMessage: string;
  workspaceRoot: string;
  /** Appended after the transcript for the backend only (editor path, selection, git diff, image paths). */
  workspaceContextAppendix?: string;
  signal?: AbortSignal;
  /** Full assistant text so far (grows incrementally). */
  onTextDelta?: (textSoFar: string) => void;
  /** Structured assistant/activity display sequence while the stream grows. */
  onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void;
  /** Model flag for the Cursor CLI backend; omit for automatic selection. */
  cliModel?: string;
  /** ask / plan / agent. */
  cliMode?: CursorCliMode;
  /** Shown in tool-approval modals so parallel runs are distinguishable. */
  toolApprovalBranchLabel?: string;
  /**
   * Tool names the agent must not use (Claude Agent SDK `disallowedTools`).
   * Used by list-builder-readonly to block workspace writes.
   */
  disallowedTools?: string[];
  /** Structured messages for the stateless ask path (provider backends). */
  llmRequest?: LlmRequest;
  /** Continuation plan for stateful agent backends (provider backends). */
  agentSession?: AgentSessionPlan;
};

/** A pluggable execution backend behind {@link AgentRunner}. */
export interface AgentBackend {
  run(input: AgentBackendRunInput): Promise<AgentRunResult>;
}

/** Supplier that provides the ask (LLM) and plan/agent (agentic) APIs. */
export type ProviderId = "anthropic" | "cursor";
