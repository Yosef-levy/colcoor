import type { GraphEventNode } from "../api/client";
import { treeEventSnippet } from "./treeNodeDisplay";

/** Tree rows the current user has starred (GET …/tree exposes `starred`). */
export function starredTreeEvents(events: readonly GraphEventNode[]): GraphEventNode[] {
  return events.filter((e) => e.starred === true);
}

/** Compact label for QuickPick (role + snippet or kind fallback). */
export function shortStarredEventLabel(ev: GraphEventNode): string {
  const role =
    ev.kind === "user_input" ? "User" : ev.kind === "assistant_output" ? "Assistant" : ev.kind;
  const snip = treeEventSnippet(ev.content_text, 64);
  const head = snip === "(empty)" ? `(${role})` : snip;
  return `${role}: ${head}`;
}
