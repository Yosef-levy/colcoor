import type { CursorAgentDisplayPart } from "./cursorAgentStreamJson";

/** Merge assistant stdout captured before and after a tool-approval resume. */
export function mergeAgentStdoutAcrossResume(base: string, next: string): string {
  const prior = base.trim();
  const current = next.trim();
  if (!prior) {
    return next;
  }
  if (!current) {
    return base;
  }
  if (current.startsWith(prior)) {
    return next;
  }
  if (prior.startsWith(current)) {
    return base;
  }
  return `${prior}\n\n${current}`;
}

export function mergeAgentDisplayPartsAcrossResume(
  prior: readonly CursorAgentDisplayPart[],
  current: readonly CursorAgentDisplayPart[],
): CursorAgentDisplayPart[] {
  const clone = (part: CursorAgentDisplayPart): CursorAgentDisplayPart =>
    part.kind === "assistant"
      ? { kind: "assistant", text: part.text }
      : { kind: "activity", entries: [...part.entries] };
  if (!prior.length) {
    return current.map(clone);
  }
  if (!current.length) {
    return prior.map(clone);
  }
  return [...prior.map(clone), ...current.map(clone)];
}
