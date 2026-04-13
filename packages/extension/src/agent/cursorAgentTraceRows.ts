/**
 * Compact trace rows persisted on assistant_output (Cursor stream-json tool_call only).
 * Omits transcript, token stream, system, and raw NDJSON.
 */

const MAX_DIFF_CHARS = 24_000;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Common Cursor tool `args` shapes for filesystem paths. */
export function pathFromToolArgs(args: Record<string, unknown>): string | undefined {
  const p =
    str(args.path) ??
    str(args.file) ??
    str(args.filePath) ??
    str(args.targetPath) ??
    str(args.relPath) ??
    str(args.uri);
  const t = p?.trim();
  return t || undefined;
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

/** Best-effort file path from unified diff headers (`+++ b/src/foo.py`, `+++ /abs/path.py`). */
export function pathFromUnifiedDiff(diff: string): string | undefined {
  const head = diff.split("\n").slice(0, 24);
  for (const line of head) {
    const m = line.match(/^\+\+\+ ([^\t\n\s]+)/);
    if (!m) {
      continue;
    }
    let raw = m[1].trim();
    if (raw === "/dev/null") {
      continue;
    }
    if (raw.startsWith("b/")) {
      raw = raw.slice(2);
    } else if (raw === "b") {
      continue;
    }
    if (raw.length > 0) {
      return raw;
    }
  }
  for (const line of head) {
    const m = line.match(/^--- ([^\t\n\s]+)/);
    if (!m) {
      continue;
    }
    let raw = m[1].trim();
    if (raw === "/dev/null") {
      continue;
    }
    if (raw.startsWith("a/")) {
      raw = raw.slice(2);
    } else if (raw === "a") {
      continue;
    }
    if (raw.length > 0) {
      return raw;
    }
  }
  return undefined;
}

/** `editToolCall` completed: diff + optional target path from args / diff headers. */
function formatEditCompleted(toolCall: Record<string, unknown>): Record<string, unknown> | null {
  const edit = toolCall.editToolCall;
  if (!edit || typeof edit !== "object") {
    return null;
  }
  const editObj = edit as Record<string, unknown>;
  const diff = extractEditDiffString(editObj);
  if (!diff) {
    return null;
  }
  const trimmed = diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n… [truncated]` : diff;
  const args = editObj.args;
  let path =
    str(editObj.path) ??
    str(editObj.filePath) ??
    str(editObj.targetPath) ??
    (args && typeof args === "object" ? pathFromToolArgs(args as Record<string, unknown>) : undefined);
  if (!path) {
    path = pathFromUnifiedDiff(trimmed);
  }
  const row: Record<string, unknown> = { colcoor_row: "edit_diff", diff: trimmed };
  if (path) {
    row.path = path;
  }
  return row;
}

/**
 * `writeToolCall` completed (Cursor docs: file writes use this, not always `editToolCall`).
 * With a diff in the payload → same `edit_diff` row as edits; otherwise a short `write_file` row.
 */
function formatWriteCompleted(toolCall: Record<string, unknown>): Record<string, unknown> | null {
  const write = toolCall.writeToolCall;
  if (!write || typeof write !== "object") {
    return null;
  }
  const w = write as Record<string, unknown>;
  const args = w.args && typeof w.args === "object" ? (w.args as Record<string, unknown>) : undefined;
  let path = args ? pathFromToolArgs(args) : undefined;
  const diff = extractEditDiffString(w);
  if (diff) {
    const trimmed = diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n… [truncated]` : diff;
    const result = w.result;
    const succ =
      result && typeof result === "object" && "success" in (result as object)
        ? ((result as { success?: unknown }).success as Record<string, unknown> | undefined)
        : undefined;
    if (!path && succ && typeof succ === "object") {
      path = str(succ.path) ?? pathFromUnifiedDiff(trimmed);
    }
    if (!path) {
      path = pathFromUnifiedDiff(trimmed);
    }
    const row: Record<string, unknown> = { colcoor_row: "edit_diff", diff: trimmed };
    if (path) {
      row.path = path;
    }
    return row;
  }
  const result = w.result;
  const succ =
    result && typeof result === "object" && "success" in (result as object)
      ? ((result as { success?: unknown }).success as Record<string, unknown> | undefined)
      : undefined;
  if (!path && succ && typeof succ === "object") {
    path = str(succ.path);
  }
  if (path) {
    return { colcoor_row: "write_file", path, text: `Wrote ${path}` };
  }
  return null;
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
  if (subtype === "completed" && tc.writeToolCall) {
    return formatWriteCompleted(tc);
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
