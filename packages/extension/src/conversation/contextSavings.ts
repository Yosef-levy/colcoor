import { formatUserMediaTranscriptFragment } from "./userEventMedia";

export const COLCOOR_CONTEXT_SAVINGS_KEY = "colcoor_context_savings";
export const CONTEXT_SAVINGS_ESTIMATOR = "chars_div_4";

export type ContextSavingsTurn = {
  version: 1;
  estimator: typeof CONTEXT_SAVINGS_ESTIMATOR;
  kind: "send" | "resend";
  linear_prompt_tokens: number;
  actual_context_tokens: number;
  linear_context_tokens: number;
  tokens_saved: number;
  percent_saved: number;
};

export type ConversationContextSavingsAggregate = {
  version: 1;
  estimator: typeof CONTEXT_SAVINGS_ESTIMATOR;
  counted_generations: number;
  current_linear_context_tokens: number;
  total_actual_context_tokens: number;
  total_linear_context_tokens: number;
  total_tokens_saved: number;
  percent_saved: number;
  last_turn?: ContextSavingsTurn;
};

function finiteInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function estimateContextSavingsTokens(text: string): number {
  const len = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").length;
  return len === 0 ? 0 : Math.max(1, Math.ceil(len / 4));
}

function percentSaved(saved: number, linear: number): number {
  if (linear <= 0 || saved <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((saved / linear) * 1000) / 10);
}

export function estimateLinearMessageTokens(
  text: string | null | undefined,
  contentJson?: Record<string, unknown> | null,
): number {
  const body = (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
  const media = formatUserMediaTranscriptFragment(contentJson ?? undefined);
  return estimateContextSavingsTokens([body, media].filter(Boolean).join("\n\n"));
}

export function estimateLinearNoteTokens(content: string | null | undefined): number {
  return estimateContextSavingsTokens(content ?? "");
}

export function buildContextSavingsTurn(params: {
  kind: ContextSavingsTurn["kind"];
  linearContextTokensBeforeRun: number;
  linearPromptTokens: number;
  actualTranscriptText: string;
}): ContextSavingsTurn {
  const actual = estimateContextSavingsTokens(params.actualTranscriptText);
  const prompt = Math.max(0, Math.floor(params.linearPromptTokens));
  const linear = Math.max(0, Math.floor(params.linearContextTokensBeforeRun)) + prompt;
  const saved = Math.max(0, linear - actual);
  return {
    version: 1,
    estimator: CONTEXT_SAVINGS_ESTIMATOR,
    kind: params.kind,
    linear_prompt_tokens: prompt,
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
  const lastTurn =
    last && typeof last === "object"
      ? (() => {
          const lastObj = last as Record<string, unknown>;
          return {
            version: 1,
            estimator: CONTEXT_SAVINGS_ESTIMATOR,
            kind: lastObj.kind === "resend" ? "resend" : "send",
            linear_prompt_tokens: finiteInt(lastObj.linear_prompt_tokens),
            actual_context_tokens: finiteInt(lastObj.actual_context_tokens),
            linear_context_tokens: finiteInt(lastObj.linear_context_tokens),
            tokens_saved: finiteInt(lastObj.tokens_saved),
            percent_saved:
              typeof lastObj.percent_saved === "number" && Number.isFinite(lastObj.percent_saved)
                ? Math.max(0, Math.min(100, lastObj.percent_saved))
                : percentSaved(finiteInt(lastObj.tokens_saved), finiteInt(lastObj.linear_context_tokens)),
          } satisfies ContextSavingsTurn;
        })()
      : undefined;
  const totalLinear = finiteInt(o.total_linear_context_tokens);
  const totalSaved = finiteInt(o.total_tokens_saved);
  return {
    version: 1,
    estimator: CONTEXT_SAVINGS_ESTIMATOR,
    counted_generations: finiteInt(o.counted_generations),
    current_linear_context_tokens: finiteInt(o.current_linear_context_tokens),
    total_actual_context_tokens: finiteInt(o.total_actual_context_tokens),
    total_linear_context_tokens: totalLinear,
    total_tokens_saved: totalSaved,
    percent_saved: percentSaved(totalSaved, totalLinear),
    ...(lastTurn ? { last_turn: lastTurn } : {}),
  };
}

export function currentLinearContextTokens(
  metadataJson: Record<string, unknown> | null | undefined,
): number {
  return readConversationContextSavingsAggregate(metadataJson)?.current_linear_context_tokens ?? 0;
}

export function mergeConversationContextSavingsMetadata(
  metadataJson: Record<string, unknown> | null | undefined,
  turn: ContextSavingsTurn,
  linearContextTokensAddedAfterRun: number,
): Record<string, unknown> {
  const prev = readConversationContextSavingsAggregate(metadataJson);
  const currentLinear =
    (prev?.current_linear_context_tokens ?? 0) +
    Math.max(0, Math.floor(linearContextTokensAddedAfterRun));
  const totalActual = (prev?.total_actual_context_tokens ?? 0) + turn.actual_context_tokens;
  const totalLinear = (prev?.total_linear_context_tokens ?? 0) + turn.linear_context_tokens;
  const totalSaved = (prev?.total_tokens_saved ?? 0) + turn.tokens_saved;
  return {
    ...(metadataJson ?? {}),
    [COLCOOR_CONTEXT_SAVINGS_KEY]: {
      version: 1,
      estimator: CONTEXT_SAVINGS_ESTIMATOR,
      counted_generations: (prev?.counted_generations ?? 0) + 1,
      current_linear_context_tokens: currentLinear,
      total_actual_context_tokens: totalActual,
      total_linear_context_tokens: totalLinear,
      total_tokens_saved: totalSaved,
      percent_saved: percentSaved(totalSaved, totalLinear),
      last_turn: turn,
    } satisfies ConversationContextSavingsAggregate,
  };
}

export function mergeConversationLinearContextTokenIncrement(
  metadataJson: Record<string, unknown> | null | undefined,
  tokensToAdd: number,
): Record<string, unknown> {
  const prev = readConversationContextSavingsAggregate(metadataJson);
  const currentLinear =
    (prev?.current_linear_context_tokens ?? 0) + Math.max(0, Math.floor(tokensToAdd));
  return {
    ...(metadataJson ?? {}),
    [COLCOOR_CONTEXT_SAVINGS_KEY]: {
      version: 1,
      estimator: CONTEXT_SAVINGS_ESTIMATOR,
      counted_generations: prev?.counted_generations ?? 0,
      current_linear_context_tokens: currentLinear,
      total_actual_context_tokens: prev?.total_actual_context_tokens ?? 0,
      total_linear_context_tokens: prev?.total_linear_context_tokens ?? 0,
      total_tokens_saved: prev?.total_tokens_saved ?? 0,
      percent_saved: prev?.percent_saved ?? 0,
      ...(prev?.last_turn ? { last_turn: prev.last_turn } : {}),
    } satisfies ConversationContextSavingsAggregate,
  };
}
