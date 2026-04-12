import type { GraphEventNode } from "../api/client";
import { pathFromRootToTip } from "./treeEvents";
import { markdownToSafeHtml } from "./threadMarkdown";

export type ThreadSegment = { role: "user" | "assistant"; html: string };

/** Root → selected path, with markdown rendered to sanitized HTML for the webview. */
export function buildThreadSegments(
  events: GraphEventNode[],
  selectedEventId: string,
): ThreadSegment[] {
  const node = events.find((e) => e.id === selectedEventId);
  if (!node) {
    return [];
  }
  const path = pathFromRootToTip(events, node);
  const out: ThreadSegment[] = [];
  for (const ev of path) {
    if (ev.kind === "user_input") {
      out.push({ role: "user", html: markdownToSafeHtml(ev.content_text ?? "") });
    } else if (ev.kind === "assistant_output") {
      out.push({ role: "assistant", html: markdownToSafeHtml(ev.content_text ?? "") });
    }
  }
  return out;
}
