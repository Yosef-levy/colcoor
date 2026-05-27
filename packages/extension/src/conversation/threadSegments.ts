import type { GraphEventNode, NoteOut } from "../api/client";
import { indexNotesByEventId, pathFromRootToTip, trimmedGraphCheckpointLabel } from "./treeEvents";
import { markdownToSafeHtml } from "./threadMarkdown";
import { countUnifiedDiffLineChanges, formatUnifiedDiffColoredHtml } from "./unifiedDiffFormat";

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bodyHtmlFromMarkdown(markdown: string): string {
  try {
    return markdownToSafeHtml(markdown ?? "");
  } catch {
    return `<pre class="md-fallback">${escapeHtmlText(markdown ?? "")}</pre>`;
  }
}

function escapeHtmlAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** One rendered note under a thread message (markdown → safe HTML). */
export type ThreadNoteBlock = {
  id: string;
  html: string;
};

export type ThreadAssistantDisplayPart =
  | { kind: "assistant"; html: string }
  | { kind: "activity"; entries: unknown[] };

export type ThreadSegment = {
  role: "user" | "assistant";
  /** Host graph event id (for diagnostics; notes are keyed to this row). */
  eventId: string;
  /** Member display name for user rows when known (thread header). */
  composerDisplayName?: string;
  /** Short Cursor model label for assistant rows when known. */
  assistantDisplayModel?: string;
  html: string;
  /** True when `visible_to` is set on this event (private draft visible only to that user). */
  privateScope?: boolean;
  /** When the API set `checkpoint_label` on this event, show in thread + plain copy ([ui-features.md] §8). */
  checkpointLabel?: string;
  /** Notes attached to this message on the active path. */
  notes?: ThreadNoteBlock[];
  /** Entries from `content_json.colcoor_agent_trace` for assistant rows (webview renders collapsible). */
  traceEntries?: unknown[];
  /** Structured assistant/activity display sequence from Cursor stream-json. */
  displayParts?: ThreadAssistantDisplayPart[];
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

function extractAgentDisplayParts(
  contentJson: Record<string, unknown> | null | undefined,
): ThreadAssistantDisplayPart[] | undefined {
  if (!contentJson) {
    return undefined;
  }
  const wrap = contentJson.colcoor_agent_trace;
  if (!wrap || typeof wrap !== "object") {
    return undefined;
  }
  const raw = (wrap as { display_parts?: unknown }).display_parts;
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const out: ThreadAssistantDisplayPart[] = [];
  for (const part of raw) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const p = part as { kind?: unknown; text?: unknown; entries?: unknown };
    if (p.kind === "assistant" && typeof p.text === "string" && p.text.trim()) {
      out.push({ kind: "assistant", html: bodyHtmlFromMarkdown(p.text) });
    } else if (p.kind === "activity" && Array.isArray(p.entries) && p.entries.length) {
      out.push({ kind: "activity", entries: enrichTraceEntriesForWebview(p.entries) });
    }
  }
  return out.length ? out : undefined;
}

/** Add `diff_html` / counts for `edit_diff` rows (webview renders without re-parsing). */
export function enrichTraceEntriesForWebview(entries: unknown[]): unknown[] {
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    const o = entry as Record<string, unknown>;
    if (o.colcoor_row !== "edit_diff" || typeof o.diff !== "string") {
      return entry;
    }
    const counts = countUnifiedDiffLineChanges(o.diff);
    return {
      ...o,
      diff_added: counts.added,
      diff_removed: counts.removed,
      diff_html: formatUnifiedDiffColoredHtml(o.diff),
    };
  });
}

/** Root → selected path, with markdown rendered to sanitized HTML for the webview. */
export function buildThreadSegments(
  events: GraphEventNode[],
  selectedEventId: string,
  notes: readonly NoteOut[] = [],
  userImageDataUrlsByEventId?: ReadonlyMap<string, readonly string[]>,
): ThreadSegment[] {
  const node = events.find((e) => e.id === selectedEventId);
  if (!node) {
    return [];
  }
  const path = pathFromRootToTip(events, node);
  const notesByEvent = indexNotesByEventId(notes);
  const out: ThreadSegment[] = [];
  for (let i = 0; i < path.length; i++) {
    const ev = path[i];
    const privateScope =
      ev.visible_to != null && String(ev.visible_to).trim() !== "";
    const text = ev.content_text ?? "";
    const rawNotes = notesByEvent.get(ev.id);
    const noteBlocks: ThreadNoteBlock[] | undefined =
      rawNotes && rawNotes.length > 0
        ? rawNotes.map((n) => ({ id: n.id, html: bodyHtmlFromMarkdown(n.body) }))
        : undefined;
    const checkpointLabel = trimmedGraphCheckpointLabel(ev);
    if (ev.kind === "user_input") {
      if (i === 0 && !text.trim() && !noteBlocks?.length && !(userImageDataUrlsByEventId?.get(ev.id)?.length)) {
        continue;
      }
      let bodyHtml = bodyHtmlFromMarkdown(text);
      const imgs = userImageDataUrlsByEventId?.get(ev.id);
      if (imgs?.length) {
        for (const u of imgs) {
          bodyHtml += `<figure class="msg-user-image"><img src="${escapeHtmlAttr(u)}" alt="User image" /></figure>`;
        }
      }
      const composerDn =
        typeof ev.composer_display_name === "string" && ev.composer_display_name.trim()
          ? ev.composer_display_name.trim()
          : undefined;
      out.push({
        role: "user",
        eventId: ev.id,
        ...(composerDn !== undefined ? { composerDisplayName: composerDn } : {}),
        html: bodyHtml,
        ...(privateScope ? { privateScope: true } : {}),
        ...(checkpointLabel !== undefined ? { checkpointLabel } : {}),
        notes: noteBlocks,
      });
    } else if (ev.kind === "assistant_output") {
      const rawTrace = extractAgentTraceEntries(ev.content_json ?? undefined);
      const displayParts = extractAgentDisplayParts(ev.content_json ?? undefined);
      const assistantDn =
        typeof ev.assistant_display_model === "string" && ev.assistant_display_model.trim()
          ? ev.assistant_display_model.trim()
          : undefined;
      out.push({
        role: "assistant",
        eventId: ev.id,
        ...(assistantDn !== undefined ? { assistantDisplayModel: assistantDn } : {}),
        html: bodyHtmlFromMarkdown(text),
        ...(privateScope ? { privateScope: true } : {}),
        ...(checkpointLabel !== undefined ? { checkpointLabel } : {}),
        notes: noteBlocks,
        traceEntries: rawTrace ? enrichTraceEntriesForWebview(rawTrace) : undefined,
        ...(displayParts ? { displayParts } : {}),
      });
    }
  }
  return out;
}
