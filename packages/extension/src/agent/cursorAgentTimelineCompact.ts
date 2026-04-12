/**
 * Reduces Cursor stream-json `tool_call` NDJSON to a few human-readable lines for Colcoor storage/UI.
 */

const MAX_DIFF_CHARS = 24_000;

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}\n… [truncated ${s.length - max} chars]`;
}

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && /^\d+$/.test(v)) {
    return parseInt(v, 10);
  }
  return null;
}

function pickLineRangeLabel(
  args: Record<string, unknown> | undefined,
  success: Record<string, unknown> | undefined,
): string | null {
  if (!args && !success) {
    return null;
  }
  const a = args ?? {};
  const s = success ?? {};
  const pairs: [unknown, unknown][] = [
    [a.startLine, a.endLine],
    [a.start_line, a.end_line],
    [s.startLine, s.endLine],
    [s.start_line, s.end_line],
  ];
  for (const [x, y] of pairs) {
    const na = toInt(x);
    const nb = toInt(y);
    if (na !== null && nb !== null) {
      return `lines ${na}:${nb}`;
    }
  }
  const tl = toInt(s.totalLines);
  if (tl !== null && tl > 0) {
    return `lines 1:${tl}`;
  }
  return null;
}

function formatReadCompleted(read: Record<string, unknown>): string | null {
  const args = read.args as Record<string, unknown> | undefined;
  const path = args?.path;
  if (typeof path !== "string" || !path.trim()) {
    return null;
  }
  const headerRaw = args?.header;
  const header = typeof headerRaw === "string" && headerRaw.trim() ? headerRaw.trim() : null;
  const succ = (read.result as { success?: Record<string, unknown> } | undefined)?.success;
  const range = pickLineRangeLabel(args, succ);
  const label = header ? `${path} — ${header}` : path;
  if (range) {
    return `Read ${label} (${range})`;
  }
  return `Read ${label}`;
}

function getEditPath(edit: Record<string, unknown>): string {
  const p = (edit.args as { path?: unknown } | undefined)?.path;
  return typeof p === "string" ? p : "";
}

function getEditDiffString(edit: Record<string, unknown>): string | null {
  const succ = (edit.result as { success?: { diffString?: unknown } } | undefined)?.success;
  const d = succ?.diffString;
  return typeof d === "string" && d.length > 0 ? d : null;
}

function formatShellStarted(shell: Record<string, unknown>): string | null {
  const args = shell.args as Record<string, unknown> | undefined;
  if (!args) {
    return null;
  }
  const cmd = args.command;
  const commandStr = typeof cmd === "string" ? cmd : "";
  if (!commandStr.trim()) {
    return null;
  }
  const descRaw = args.description ?? args.explanation ?? args.summary ?? args.title;
  const descStr = typeof descRaw === "string" && descRaw.trim() ? descRaw.trim() : "";
  if (descStr) {
    return `${descStr}\ncommand: ${commandStr}`;
  }
  return `command: ${commandStr}`;
}

function stringifyFailure(f: unknown): string {
  if (!f || typeof f !== "object") {
    return "";
  }
  const o = f as Record<string, unknown>;
  const stderr = typeof o.stderr === "string" ? o.stderr.trim() : "";
  const msg = typeof o.message === "string" ? o.message.trim() : "";
  return truncate([stderr, msg].filter(Boolean).join("\n") || JSON.stringify(o), 4000);
}

function formatShellCompleted(shell: Record<string, unknown>): string | null {
  const args = shell.args as Record<string, unknown> | undefined;
  const cmd = typeof args?.command === "string" ? args.command : "";
  const res = shell.result as Record<string, unknown> | undefined;
  if (res?.failure) {
    const detail = stringifyFailure(res.failure);
    const head = cmd.trim() ? `command rejected - ${cmd}` : "command rejected";
    return detail ? `${head}\n${detail}` : head;
  }
  if (res?.success && typeof res.success === "object") {
    const suc = res.success as Record<string, unknown>;
    const stdout = typeof suc.stdout === "string" ? suc.stdout : "";
    const stderr = typeof suc.stderr === "string" ? suc.stderr : "";
    const code = suc.exitCode;
    const lines: string[] = [];
    if (cmd.trim()) {
      lines.push(`command: ${cmd}`);
    }
    if (code !== undefined) {
      lines.push(`exit: ${String(code)}`);
    }
    if (stdout.trim()) {
      lines.push(`stdout:\n${truncate(stdout.trim(), 12_000)}`);
    }
    if (stderr.trim()) {
      lines.push(`stderr:\n${truncate(stderr.trim(), 8000)}`);
    }
    return lines.length ? lines.join("\n\n") : null;
  }
  return cmd.trim() ? `command: ${cmd}` : null;
}

/** One compact row for `colcoor_agent_trace.entries`, or null to omit. */
export function compactToolCallForTimeline(o: Record<string, unknown>): Record<string, unknown> | null {
  if (o.type !== "tool_call" || typeof o.subtype !== "string") {
    return null;
  }
  const subtype = o.subtype;
  const tc = o.tool_call;
  if (!tc || typeof tc !== "object") {
    return null;
  }
  const tco = tc as Record<string, unknown>;

  const read = tco.readToolCall;
  if (read && typeof read === "object" && subtype === "completed") {
    const summary = formatReadCompleted(read as Record<string, unknown>);
    return summary
      ? { colcoor_compact: true, kind: "read", summary }
      : null;
  }

  const edit = tco.editToolCall;
  if (edit && typeof edit === "object" && subtype === "completed") {
    const ed = edit as Record<string, unknown>;
    const diffRaw = getEditDiffString(ed);
    if (!diffRaw) {
      return null;
    }
    const path = getEditPath(ed);
    const summary = path ? `Edit ${path}` : "Edit";
    const diff = truncate(diffRaw, MAX_DIFF_CHARS);
    return { colcoor_compact: true, kind: "edit_diff", summary, diff };
  }

  const shell = tco.shellToolCall;
  if (shell && typeof shell === "object") {
    const sh = shell as Record<string, unknown>;
    if (subtype === "started") {
      const summary = formatShellStarted(sh);
      return summary ? { colcoor_compact: true, kind: "shell_start", summary } : null;
    }
    if (subtype === "completed") {
      const summary = formatShellCompleted(sh);
      return summary ? { colcoor_compact: true, kind: "shell_done", summary } : null;
    }
  }

  return null;
}
