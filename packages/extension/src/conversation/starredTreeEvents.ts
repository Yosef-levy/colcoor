import type { GraphEventNode } from "../api/client";

/** Tree rows the current user has starred (GET …/tree exposes `starred`). */
export function starredTreeEvents(events: readonly GraphEventNode[]): GraphEventNode[] {
  return events.filter((e) => e.starred === true);
}

/** Compact label for QuickPick (role + snippet or kind fallback). */
export function shortStarredEventLabel(ev: GraphEventNode): string {
  const role =
    ev.kind === "user_input" ? "User" : ev.kind === "assistant_output" ? "Assistant" : ev.kind;
  const t = (ev.content_text ?? "").replace(/\s+/g, " ").trim();
  const head = t ? t.slice(0, 64) : `(${role})`;
  return `${role}: ${head}`;
}
