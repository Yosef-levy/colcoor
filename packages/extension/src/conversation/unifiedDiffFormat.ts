/**
 * Unified diff presentation for the conversation webview (line counts + colored HTML).
 */

export type UnifiedDiffCounts = { added: number; removed: number };

export type UnifiedDiffLineKind =
  | "meta_plus"
  | "meta_minus"
  | "hunk"
  | "add"
  | "del"
  | "ctx"
  | "noeol";

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Classify one line of unified diff output (metadata vs hunk vs change). */
export function classifyUnifiedDiffLine(line: string): UnifiedDiffLineKind {
  if (line.startsWith("+++")) {
    return "meta_plus";
  }
  if (line.startsWith("---")) {
    return "meta_minus";
  }
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("+")) {
    return "add";
  }
  if (line.startsWith("-")) {
    return "del";
  }
  if (line.startsWith("\\")) {
    return "noeol";
  }
  return "ctx";
}

/**
 * Count content lines added/removed (excludes `+++` / `---` / `@@` headers).
 */
export function countUnifiedDiffLineChanges(diff: string): UnifiedDiffCounts {
  let added = 0;
  let removed = 0;
  for (const line of diff.split(/\r?\n/)) {
    const k = classifyUnifiedDiffLine(line);
    if (k === "add") {
      added += 1;
    } else if (k === "del") {
      removed += 1;
    }
  }
  return { added, removed };
}

const KIND_CLASS: Record<UnifiedDiffLineKind, string> = {
  meta_plus: "diff-line diff-meta diff-meta-plus",
  meta_minus: "diff-line diff-meta diff-meta-minus",
  hunk: "diff-line diff-hunk",
  add: "diff-line diff-add",
  del: "diff-line diff-del",
  ctx: "diff-line diff-ctx",
  noeol: "diff-line diff-noeol",
};

/** Safe HTML: one block span per line (for webview innerHTML). */
export function formatUnifiedDiffColoredHtml(diff: string): string {
  const lines = diff.split(/\r?\n/);
  const parts: string[] = [
    '<div class="trace-pre trace-diff trace-diff-colored"><code class="trace-diff-lines">',
  ];
  for (const line of lines) {
    const kind = classifyUnifiedDiffLine(line);
    const cls = KIND_CLASS[kind];
    parts.push(`<span class="${cls}">${escapeHtmlText(line)}</span>`);
  }
  parts.push("</code></div>");
  return parts.join("");
}
