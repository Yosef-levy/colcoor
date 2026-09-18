import type { SlashInvocation } from "./types";

/**
 * Match a whole-message leading slash command: `/name` or `/name args…`.
 * Names are letters, digits, underscore, hyphen, and colon (for plugin-qualified skills).
 * Non-leading `/` (e.g. mid-sentence paths) returns null.
 */
const LEADING_SLASH_RE = /^\/([A-Za-z0-9_.:-]+)(?:\s+([\s\S]*))?$/;

export function parseSlashCommand(text: string): SlashInvocation | null {
  const trimmed = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const m = LEADING_SLASH_RE.exec(trimmed);
  if (!m) {
    return null;
  }
  const name = m[1]?.trim() ?? "";
  if (!name) {
    return null;
  }
  const args = (m[2] ?? "").trimEnd();
  return {
    name,
    args: args.trim() === "" ? "" : args.trim(),
    rawText: trimmed,
  };
}

/**
 * True when the composer caret is inside a leading `/…` token suitable for autocomplete.
 * Only the first line / start of the message triggers the picker.
 */
export function slashAutocompleteContext(
  value: string,
  caret: number,
): { start: number; end: number; query: string } | null {
  const v = String(value ?? "");
  const pos = Math.max(0, Math.min(typeof caret === "number" ? caret : v.length, v.length));
  const before = v.slice(0, pos);
  // Only trigger when the message starts with `/` (optional leading whitespace).
  const lead = before.match(/^(\s*)\/([A-Za-z0-9_.:-]*)$/);
  if (!lead) {
    return null;
  }
  const ws = lead[1] ?? "";
  const query = lead[2] ?? "";
  const start = ws.length;
  return { start, end: pos, query };
}
