/**
 * MCP App iframe helpers: some hosts send tool results with only `content` text,
 * not `structuredContent`. Our `ok(summary, payload)` format is
 * `summary + "\n\n" + JSON.stringify(payload)`, which is not valid JSON as a whole.
 *
 * Keep the embedded boot script in explorerBootScript.ts aligned with this module.
 */

export function parseStructuredJsonFromToolTextBlock(text: string): unknown {
  const t = String(text ?? "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    const gap = t.indexOf("\n\n");
    if (gap >= 0) {
      try {
        return JSON.parse(t.slice(gap + 2).trim());
      } catch {
        // fall through
      }
    }
    const brace = t.indexOf("{");
    if (brace >= 0) {
      try {
        return JSON.parse(t.slice(brace));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function structuredObjectFromToolResultCandidate(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== "object") return null;
  const p = params as { structuredContent?: unknown; content?: unknown };
  if (
    p.structuredContent &&
    typeof p.structuredContent === "object" &&
    !Array.isArray(p.structuredContent)
  ) {
    return p.structuredContent as Record<string, unknown>;
  }
  const c = p.content;
  if (!Array.isArray(c)) return null;
  for (const item of c) {
    if (
      item &&
      typeof item === "object" &&
      (item as { type?: string }).type === "text" &&
      typeof (item as { text?: string }).text === "string"
    ) {
      const parsed = parseStructuredJsonFromToolTextBlock((item as { text: string }).text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    }
  }
  return null;
}
