/** Max length for tree row snippet text ([tree-ui-contract.md] §7). */
export const TREE_EVENT_SNIPPET_MAX = 96;

/** Max length for optional display title from `content_json` (conversation webview tree). */
export const TREE_EVENT_DISPLAY_TITLE_MAX = 160;

/**
 * Compact single-line snippet for tree nodes and similar UI.
 * Collapses internal whitespace; empty after trim → `"(empty)"`.
 */
export function treeEventSnippet(
  contentText: string | null | undefined,
  maxLen: number = TREE_EVENT_SNIPPET_MAX,
): string {
  const t = String(contentText ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) {
    return "(empty)";
  }
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

/**
 * Optional per-event title from agent `content_json` envelope (if ever set).
 * Matches the conversation webview `eventDisplayTitle` behavior.
 */
export function treeEventDisplayTitleFromContentJson(
  contentJson: Record<string, unknown> | null | undefined,
  maxLen: number = TREE_EVENT_DISPLAY_TITLE_MAX,
): string {
  if (!contentJson || typeof contentJson !== "object") {
    return "";
  }
  const raw = contentJson.title ?? contentJson.message_title ?? contentJson.display_title;
  if (typeof raw !== "string") {
    return "";
  }
  const s = raw.trim();
  if (!s) {
    return "";
  }
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}
