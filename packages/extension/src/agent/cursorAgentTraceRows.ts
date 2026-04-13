/**
 * Compact trace rows persisted on assistant_output (Cursor stream-json tool_call only).
 * Omits transcript, token stream, system, and raw NDJSON.
 */

const MAX_DIFF_CHARS = 24_000;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(v);
  }
  if (typeof v === "string" && v.trim() !== "") {
    return v.trim();
  }
  return undefined;
}

/** `readToolCall` started: one line with optional header and line range. */
function formatReadStarted(toolCall: Record<string, unknown>): Record<string, unknown> | null {
  const read = toolCall.readToolCall;
  if (!read || typeof read !== "object") {
    return null;
  }
  const args = (read as { args?: Record<string, unknown> }).args;
  if (!args || typeof args !== "object") {
    return null;
  }
  const path = str(args.path);
  if (!path) {
    return null;
  }
  const header = str(args.header) ?? str(args.title) ?? str(args.name);
  const startLine = num(args.startLine ?? args.start_line ?? args.start ?? args.line);
  const endLine = num(args.endLine ?? args.end_line ?? args.end);
  let text = "Read ";
  if (header) {
    text += `[${header}] `;
  }
  text += path;
  if (startLine != null && endLine != null) {
    text += ` (lines ${startLine}:${endLine})`;
  } else if (startLine != null) {
    text += ` (from line ${startLine})`;
  }
  return { colcoor_row: "read", text };
}

function extractEditDiffString(edit: Record<string, unknown>): string | undefined {
  const result = edit.result;
  if (result == null) {
    return undefined;
  }
  const walk = (obj: unknown): string | undefined => {
    if (obj == null || typeof obj !== "object") {
      return undefined;
    }
    if (Array.isArray(obj)) {
      for (const x of obj) {
        const w = walk(x);
        if (w) {
          return w;
        }
      }
      return undefined;
    }
    const o = obj as Record<string, unknown>;
    if (typeof o.diffString === "string" && o.diffString.length > 0) {
      return o.diffString;
    }
    for (const v of Object.values(o)) {
      const w = walk(v);
      if (w) {
        return w;
      }
    }
    return undefined;
  };
  return walk(result);
}

/** `editToolCall` completed: diff only. */
function formatEditCompleted(toolCall: Record<string, unknown>): Record<string, unknown> | null {
  const edit = toolCall.editToolCall;
  if (!edit || typeof edit !== "object") {
    return null;
  }
  const diff = extractEditDiffString(edit as Record<string, unknown>);
  if (!diff) {
    return null;
  }
  const trimmed = diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n… [truncated]` : diff;
  return { colcoor_row: "edit_diff", diff: trimmed };
}

function formatShellResult(result: unknown): string {
  if (result == null) {
    return "";
  }
  if (typeof result === "string") {
    return result.length > 8000 ? `${result.slice(0, 8000)}…` : result;
  }
  if (typeof result !== "object") {
    return String(result);
  }
  const o = result as Record<string, unknown>;
  if ("rejected" in o && o.rejected != null) {
    let r: string;
    try {
      r = JSON.stringify(o.rejected, null, 2);
    } catch {
      r = String(o.rejected);
    }
    return r.length > 8000 ? `${r.slice(0, 8000)}…` : r;
  }
  if ("success" in o && o.success != null && typeof o.success === "object") {
    const s = o.success as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of ["exitCode", "stdout", "stderr", "output", "message"]) {
      if (s[k] != null) {
        parts.push(`${k}: ${typeof s[k] === "string" ? s[k] : JSON.stringify(s[k])}`);
      }
    }
    const out = parts.join("\n");
    return out.length > 8000 ? `${out.slice(0, 8000)}…` : out;
  }
  try {
    const j = JSON.stringify(o, null, 2);
    return j.length > 8000 ? `${j.slice(0, 8000)}…` : j;
  } catch {
    return String(result);
  }
}

/** `shellToolCall` started: description + command. */
function formatShellStarted(toolCall: Record<string, unknown>): Record<string, unknown> | null {
  const shell = toolCall.shellToolCall;
  if (!shell || typeof shell !== "object") {
    return null;
  }
  const args = (shell as { args?: Record<string, unknown> }).args;
  if (!args || typeof args !== "object") {
    return null;
  }
  const cmd = str(args.command) ?? "";
  const desc = str(args.description) ?? "";
  let text = desc ? `${desc}\n` : "";
  text += `command: ${cmd}`;
  return { colcoor_row: "shell_start", text };
}

/** `shellToolCall` completed: command + result (rejection shown plainly). */
function formatShellCompleted(toolCall: Record<string, unknown>): Record<string, unknown> | null {
  const shell = toolCall.shellToolCall;
  if (!shell || typeof shell !== "object") {
    return null;
  }
  const s = shell as { args?: Record<string, unknown>; result?: unknown };
  const cmd = s.args && typeof s.args === "object" ? str((s.args as Record<string, unknown>).command) ?? "" : "";
  const result = s.result;
  let text: string;
  if (result && typeof result === "object" && "rejected" in (result as object)) {
    text = `command rejected — ${cmd}\n${formatShellResult(result)}`;
  } else {
    const body = formatShellResult(result);
    text = body ? `command: ${cmd}\n${body}` : `command: ${cmd}`;
  }
  return { colcoor_row: "shell_done", text };
}

/**
 * Turn one `tool_call` NDJSON payload into a compact row, or null if not a tracked tool/subtype.
 */
export function formatToolCallTraceRow(
  subtype: string,
  toolCall: unknown,
): Record<string, unknown> | null {
  if (!toolCall || typeof toolCall !== "object") {
    return null;
  }
  const tc = toolCall as Record<string, unknown>;

  if (subtype === "started" && tc.readToolCall) {
    return formatReadStarted(tc);
  }
  if (subtype === "completed" && tc.editToolCall) {
    return formatEditCompleted(tc);
  }
  if (subtype === "started" && tc.shellToolCall) {
    return formatShellStarted(tc);
  }
  if (subtype === "completed" && tc.shellToolCall) {
    return formatShellCompleted(tc);
  }
  return null;
}
