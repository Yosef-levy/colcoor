import type { GraphEventNode, NoteOut } from "../api/client";
import { buildAuthoritativeTranscript } from "../transcript/buildTranscript";
import { graphPathToTranscriptTurns, indexNotesByEventId } from "./treeEvents";

export const COLCOOR_CONTEXT_SAVINGS_KEY = "colcoor_context_savings";
export const CONTEXT_SAVINGS_ESTIMATOR = "chars_div_4";

export type ContextSavingsTurn = {
  version: 1;
  estimator: typeof CONTEXT_SAVINGS_ESTIMATOR;
  kind: "send" | "resend";
  actual_context_tokens: number;
  linear_context_tokens: number;
  tokens_saved: number;
  percent_saved: number;
};

export type ConversationContextSavingsAggregate = {
  version: 1;
  estimator: typeof CONTEXT_SAVINGS_ESTIMATOR;
  counted_generations: number;
  total_actual_context_tokens: number;
  total_linear_context_tokens: number;
  total_tokens_saved: number;
  percent_saved: number;
  last_turn: ContextSavingsTurn;
};

function finiteInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function estimateTokens(text: string): number {
  const len = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").length;
  return len === 0 ? 0 : Math.max(1, Math.ceil(len / 4));
}

function percentSaved(saved: number, linear: number): number {
  if (linear <= 0 || saved <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((saved / linear) * 1000) / 10);
}

function sortLinearEvents(events: readonly GraphEventNode[]): GraphEventNode[] {
  return [...events].sort((a, b) => {
    const byTime = String(a.created_at).localeCompare(String(b.created_at));
    return byTime !== 0 ? byTime : String(a.id).localeCompare(String(b.id));
  });
}

export function buildContextSavingsTurn(params: {
  kind: ContextSavingsTurn["kind"];
  conversationTitle: string | null | undefined;
  visibleEventsBeforeRun: readonly GraphEventNode[];
  visibleNotes: readonly NoteOut[];
  actualTranscriptText: string;
  finalUserMessage?: string | null;
  finalUserMediaContentJson?: Record<string, unknown> | null;
}): ContextSavingsTurn {
  const notesByEventId = indexNotesByEventId(params.visibleNotes);
  const linearTranscriptText = buildAuthoritativeTranscript({
    conversationTitle: params.conversationTitle,
    pathFromRoot: graphPathToTranscriptTurns(sortLinearEvents(params.visibleEventsBeforeRun), notesByEventId),
    finalUserMessage: params.finalUserMessage,
    finalUserMediaContentJson: params.finalUserMediaContentJson,
  });
  const actual = estimateTokens(params.actualTranscriptText);
  const linear = estimateTokens(linearTranscriptText);
  const saved = Math.max(0, linear - actual);
  return {
    version: 1,
    estimator: CONTEXT_SAVINGS_ESTIMATOR,
    kind: params.kind,
    actual_context_tokens: actual,
    linear_context_tokens: linear,
    tokens_saved: saved,
    percent_saved: percentSaved(saved, linear),
  };
}

export function readConversationContextSavingsAggregate(
  metadataJson: Record<string, unknown> | null | undefined,
): ConversationContextSavingsAggregate | undefined {
  const raw = metadataJson?.[COLCOOR_CONTEXT_SAVINGS_KEY];
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const last = o.last_turn;
  if (!last || typeof last !== "object") {
    return undefined;
  }
  const lastObj = last as Record<string, unknown>;
  const lastTurn: ContextSavingsTurn = {
    version: 1,
    estimator: CONTEXT_SAVINGS_ESTIMATOR,
    kind: lastObj.kind === "resend" ? "resend" : "send",
    actual_context_tokens: finiteInt(lastObj.actual_context_tokens),
    linear_context_tokens: finiteInt(lastObj.linear_context_tokens),
    tokens_saved: finiteInt(lastObj.tokens_saved),
    percent_saved:
      typeof lastObj.percent_saved === "number" && Number.isFinite(lastObj.percent_saved)
        ? Math.max(0, Math.min(100, lastObj.percent_saved))
        : percentSaved(finiteInt(lastObj.tokens_saved), finiteInt(lastObj.linear_context_tokens)),
  };
  const totalLinear = finiteInt(o.total_linear_context_tokens);
  const totalSaved = finiteInt(o.total_tokens_saved);
  return {
    version: 1,
    estimator: CONTEXT_SAVINGS_ESTIMATOR,
    counted_generations: finiteInt(o.counted_generations),
    total_actual_context_tokens: finiteInt(o.total_actual_context_tokens),
    total_linear_context_tokens: totalLinear,
    total_tokens_saved: totalSaved,
    percent_saved: percentSaved(totalSaved, totalLinear),
    last_turn: lastTurn,
  };
}

export function mergeConversationContextSavingsMetadata(
  metadataJson: Record<string, unknown> | null | undefined,
  turn: ContextSavingsTurn,
): Record<string, unknown> {
  const prev = readConversationContextSavingsAggregate(metadataJson);
  const totalActual = (prev?.total_actual_context_tokens ?? 0) + turn.actual_context_tokens;
  const totalLinear = (prev?.total_linear_context_tokens ?? 0) + turn.linear_context_tokens;
  const totalSaved = (prev?.total_tokens_saved ?? 0) + turn.tokens_saved;
  return {
    ...(metadataJson ?? {}),
    [COLCOOR_CONTEXT_SAVINGS_KEY]: {
      version: 1,
      estimator: CONTEXT_SAVINGS_ESTIMATOR,
      counted_generations: (prev?.counted_generations ?? 0) + 1,
      total_actual_context_tokens: totalActual,
      total_linear_context_tokens: totalLinear,
      total_tokens_saved: totalSaved,
      percent_saved: percentSaved(totalSaved, totalLinear),
      last_turn: turn,
    } satisfies ConversationContextSavingsAggregate,
  };
}
