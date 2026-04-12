import type { GraphEventNode } from "../api/client";
import { pathFromRootToTip } from "./treeEvents";
import { markdownToSafeHtml } from "./threadMarkdown";

export type ThreadSegment = {
  role: "user" | "assistant";
  html: string;
  /** Entries from `content_json.colcoor_agent_trace` for assistant rows (webview renders collapsible). */
  traceEntries?: unknown[];
};

export function extractAgentTraceEntries(
  contentJson: Record<string, unknown> | null | undefined,
): unknown[] | undefined {
  if (!contentJson) {
    return undefined;
  }
  const wrap = contentJson.colcoor_agent_trace;
  if (!wrap || typeof wrap !== "object") {
    return undefined;
  }
  const entries = (wrap as { entries?: unknown }).entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return undefined;
  }
  return entries;
}

function escapePlainForWebview(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bodyHtmlFromContentText(raw: unknown): string {
  const s = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  try {
    return markdownToSafeHtml(s);
  } catch {
    return `<pre>${escapePlainForWebview(s)}</pre>`;
  }
}

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
      out.push({ role: "user", html: bodyHtmlFromContentText(ev.content_text) });
    } else if (ev.kind === "assistant_output") {
      out.push({
        role: "assistant",
        html: bodyHtmlFromContentText(ev.content_text),
        traceEntries: extractAgentTraceEntries(ev.content_json ?? undefined),
      });
    }
  }
  return out;
}
