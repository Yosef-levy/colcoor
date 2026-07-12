/** Self-contained metadata readers/formatters (no imports) for webview injection. */

export type MetadataRow = {
  label: string;
  value: string;
  mono?: boolean;
};

export type MetadataSection = {
  title: string;
  rows: MetadataRow[];
  note?: string;
};

export type MessageMetadataViewModel = {
  role: "user" | "assistant";
  headline: string;
  sections: MetadataSection[];
  advancedJson: Record<string, unknown>;
};

export type MessageMetadataEvent = {
  id: string;
  kind: string;
  content_text: string | null;
  content_json?: Record<string, unknown> | null;
  parent_event_id: string | null;
  created_at: string;
  checkpoint_label?: string | null;
  starred?: boolean;
  note_count?: number;
  visible_to: string | null;
  composer_display_name?: string | null;
  assistant_display_model?: string | null;
};

/**
 * Factory keeps all helpers in one closure so {@link messageMetadataWebviewScriptBlock} can
 * inject a self-contained script via `toString()` (top-level-only extraction breaks at runtime).
 */
export function createMessageMetadataApi() {
  const COLOOR_PROVIDER_USAGE_KEY = "colcoor_provider_usage";
  const COLOOR_AGENT_SESSION_KEY = "colcoor_agent_session";
  const COLOOR_AGENT_META_KEY = "colcoor_agent_meta";
  const COLOOR_AGENT_TRACE_KEY = "colcoor_agent_trace";
  const COLOOR_USER_MEDIA_KEY = "colcoor_user_media";

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatCompactNumber(n: number): string {
    const x = Math.abs(n);
    if (x >= 1_000_000) {
      return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    }
    if (x >= 1_000) {
      return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
    }
    return String(n);
  }

  function computeCacheHitPercent(tokens: {
    input?: number;
    cache_read?: number;
    cache_creation?: number;
  }): number | null {
    const cacheRead = tokens.cache_read ?? 0;
    const input = tokens.input ?? 0;
    const cacheCreation = tokens.cache_creation ?? 0;
    const denom = input + cacheRead + cacheCreation;
    if (denom <= 0) {
      return null;
    }
    return (cacheRead / denom) * 100;
  }

  function readUsage(cj: Record<string, unknown> | null | undefined) {
    if (!cj) return undefined;
    const raw = cj[COLOOR_PROVIDER_USAGE_KEY];
    if (!raw || typeof raw !== "object") return undefined;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return undefined;
    const tokensRaw = o.tokens;
    if (!tokensRaw || typeof tokensRaw !== "object") return undefined;
    const t = tokensRaw as Record<string, unknown>;
    if (typeof t.input !== "number" || typeof t.output !== "number") return undefined;
    return o;
  }

  function readMeta(cj: Record<string, unknown> | null | undefined) {
    if (!cj) return undefined;
    const raw = cj[COLOOR_AGENT_META_KEY];
    if (!raw || typeof raw !== "object") return undefined;
    return raw as Record<string, unknown>;
  }

  function readSession(cj: Record<string, unknown> | null | undefined) {
    if (!cj) return undefined;
    const raw = cj[COLOOR_AGENT_SESSION_KEY];
    if (!raw || typeof raw !== "object") return undefined;
    const o = raw as Record<string, unknown>;
    if (typeof o.session_id !== "string" || !o.session_id.trim()) return undefined;
    return o;
  }

  function hasTrace(cj: Record<string, unknown> | null | undefined): boolean {
    const raw = cj?.[COLOOR_AGENT_TRACE_KEY];
    if (!raw || typeof raw !== "object") return false;
    const entries = (raw as Record<string, unknown>).entries;
    return Array.isArray(entries) && entries.length > 0;
  }

  function parseImages(cj: Record<string, unknown> | null | undefined): Array<{ id: string }> {
    if (!cj) return [];
    const wrap = cj[COLOOR_USER_MEDIA_KEY];
    if (!wrap || typeof wrap !== "object") return [];
    const o = wrap as Record<string, unknown>;
    if (o.version !== 1 || !Array.isArray(o.images)) return [];
    return o.images.filter(
      (img): img is { id: string } =>
        !!img && typeof img === "object" && typeof (img as { id?: string }).id === "string",
    );
  }

  function formatUsd(value: unknown): string | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    if (value === 0) return "$0.00";
    if (value < 0.01) return "<$0.01";
    return `$${value.toFixed(value >= 1 ? 2 : 4).replace(/0+$/, "").replace(/\.$/, "")}`;
  }

  function formatDurationMs(ms: unknown): string | undefined {
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return undefined;
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")} s`;
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  function backendLabel(backend: unknown): string | undefined {
    if (backend === "messages_api") return "Messages API";
    if (backend === "claude_agent_sdk") return "Claude Agent SDK";
    if (backend === "cursor_cli") return "Cursor CLI";
    return typeof backend === "string" ? backend : undefined;
  }

  function modeLabel(mode: unknown): string | undefined {
    if (mode === "ask" || mode === "plan" || mode === "agent") {
      return String(mode).charAt(0).toUpperCase() + String(mode).slice(1);
    }
    return typeof mode === "string" ? mode : undefined;
  }

  function row(label: string, value: string | undefined, mono = false): MetadataRow | null {
    const v = value?.trim();
    if (!v) return null;
    return { label, value: v, mono };
  }

  function hasDisplayableMetadata(
    event: Pick<MessageMetadataEvent, "id" | "kind" | "content_json">,
  ): boolean {
    if (!event?.id?.trim()) return false;
    if (event.kind === "user_input" || event.kind === "assistant_output") return true;
    const cj = event.content_json ?? undefined;
    return Boolean(readUsage(cj) || readSession(cj) || readMeta(cj) || hasTrace(cj));
  }

  function readMessageMetadata(event: MessageMetadataEvent): MessageMetadataViewModel | null {
    if (!hasDisplayableMetadata(event)) return null;
    const cj = event.content_json ?? undefined;
    const isUser = event.kind === "user_input";
    const sections: MetadataSection[] = [];

    if (isUser) {
      const images = parseImages(cj);
      const rows = [
        row("Role", "User"),
        row("Author", event.composer_display_name ?? undefined),
        row("Created", event.created_at),
        row("Private branch", event.visible_to != null ? "yes" : "no"),
        row("Checkpoint / title", event.checkpoint_label ?? undefined),
        row("Starred", event.starred === true ? "yes" : "no"),
        row("Notes", event.note_count != null ? String(event.note_count) : undefined),
        row(
          "Image attachments",
          images.length > 0 ? `${images.length} (${images.map((i) => i.id).join(", ")})` : undefined,
          true,
        ),
        row("Parent event id", event.parent_event_id ?? undefined, true),
        row("Event id", event.id, true),
      ].filter((r): r is MetadataRow => r != null);
      sections.push({
        title: "Colcoor graph",
        rows,
        note: "Usage appears on the assistant reply that follows.",
      });
    } else {
      const usage = readUsage(cj);
      const meta = readMeta(cj);
      const session = readSession(cj);
      const trace = hasTrace(cj);
      const summaryRows: MetadataRow[] = [];
      const push = (label: string, value: string | undefined, mono = false): void => {
        const r = row(label, value, mono);
        if (r) summaryRows.push(r);
      };
      const model =
        (typeof usage?.model === "string" ? usage.model : undefined) ??
        (typeof meta?.model_id === "string" ? meta.model_id : undefined) ??
        event.assistant_display_model ??
        undefined;
      push("Model", model);
      push("Mode", modeLabel(usage?.mode));
      push("Backend", backendLabel(usage?.backend) ?? (trace ? "Cursor CLI" : undefined));
      push("Estimated cost (USD)", formatUsd(usage?.cost_usd));
      const tokens = usage?.tokens as Record<string, number> | undefined;
      if (tokens && typeof tokens.input === "number") {
        const total =
          (tokens.input ?? 0) +
          (tokens.output ?? 0) +
          (tokens.cache_read ?? 0) +
          (tokens.cache_creation ?? 0);
        push("Total tokens", formatCompactNumber(total));
        const cachePct = computeCacheHitPercent(tokens);
        if (cachePct != null) {
          push("Cache hit", `${cachePct.toFixed(1).replace(/\.0$/, "")}%`);
        }
      }
      push("Duration", formatDurationMs(usage?.duration_ms));
      push(
        "Status",
        usage?.cancelled === true ? "cancelled (partial)" : usage || trace ? "completed" : "completed",
      );
      if (summaryRows.length > 0) {
        sections.push({
          title: "Summary",
          rows: summaryRows,
          ...(!usage
            ? {
                note: trace
                  ? "Open the collapsible activity trace under the message for tool details."
                  : "Usage not recorded for this message.",
              }
            : {}),
        });
      } else if (trace) {
        sections.push({
          title: "Summary",
          rows: [
            ...(model ? [{ label: "Model", value: model }] : []),
            { label: "Backend", value: "Cursor CLI" },
            { label: "Status", value: "completed" },
          ],
          note: "Open the collapsible activity trace under the message for tool details.",
        });
      }
      if (tokens && typeof tokens.input === "number") {
        const tokenRows = [
          row("Input (uncached)", formatCompactNumber(tokens.input)),
          row("Output", formatCompactNumber(tokens.output ?? 0)),
          row(
            "Cache read",
            typeof tokens.cache_read === "number" ? formatCompactNumber(tokens.cache_read) : undefined,
          ),
          row(
            "Cache write",
            typeof tokens.cache_creation === "number"
              ? formatCompactNumber(tokens.cache_creation)
              : undefined,
          ),
          row(
            "Cache write (5m TTL)",
            typeof tokens.cache_creation_5m === "number"
              ? formatCompactNumber(tokens.cache_creation_5m)
              : undefined,
          ),
          row(
            "Cache write (1h TTL)",
            typeof tokens.cache_creation_1h === "number"
              ? formatCompactNumber(tokens.cache_creation_1h)
              : undefined,
          ),
          row(
            "Thinking",
            typeof tokens.thinking === "number" ? formatCompactNumber(tokens.thinking) : undefined,
          ),
        ].filter((r): r is MetadataRow => r != null);
        if (tokenRows.length > 0) sections.push({ title: "Tokens", rows: tokenRows });
      }
      const runRows = [
        row("Agent turns", typeof usage?.num_turns === "number" ? String(usage.num_turns) : undefined),
        row("API time", formatDurationMs(usage?.duration_api_ms)),
        row("Stop reason", typeof usage?.stop_reason === "string" ? usage.stop_reason : undefined),
        row("Continuation", typeof usage?.continuation === "string" ? usage.continuation : undefined),
        row(
          "Prompt cache TTL",
          typeof usage?.prompt_cache_ttl === "string" ? usage.prompt_cache_ttl : undefined,
        ),
        row(
          "Permission denials",
          typeof usage?.permission_denials === "number" ? String(usage.permission_denials) : undefined,
        ),
      ].filter((r): r is MetadataRow => r != null);
      if (runRows.length > 0) sections.push({ title: "Run details", rows: runRows });
      const advancedRows = [
        row("Colcoor event id", event.id, true),
        row(
          "Provider message id",
          (typeof usage?.message_id === "string" ? usage.message_id : undefined) ??
            (typeof session?.last_message_id === "string" ? session.last_message_id : undefined),
          true,
        ),
        row(
          "Provider session id",
          typeof session?.session_id === "string" ? session.session_id : undefined,
          true,
        ),
        row("Created at", event.created_at),
        row("Private branch", event.visible_to != null ? "yes" : "no"),
        row("Checkpoint / title", event.checkpoint_label ?? undefined),
        row("Parent event id", event.parent_event_id ?? undefined, true),
      ].filter((r): r is MetadataRow => r != null);
      if (advancedRows.length > 0) sections.push({ title: "Session / IDs", rows: advancedRows });
    }

    const advancedJson: Record<string, unknown> = {
      event_id: event.id,
      kind: event.kind,
      created_at: event.created_at,
      parent_event_id: event.parent_event_id,
      checkpoint_label: event.checkpoint_label ?? null,
      starred: event.starred === true,
      note_count: event.note_count ?? 0,
      visible_to: event.visible_to ?? null,
    };
    if (cj) {
      for (const key of [
        COLOOR_PROVIDER_USAGE_KEY,
        COLOOR_AGENT_SESSION_KEY,
        COLOOR_AGENT_META_KEY,
        COLOOR_AGENT_TRACE_KEY,
      ]) {
        if (cj[key]) advancedJson[key] = cj[key];
      }
    }
    return {
      role: isUser ? "user" : "assistant",
      headline: isUser ? "User message metadata" : "Assistant message metadata",
      sections,
      advancedJson,
    };
  }

  function formatMessageMetadataHtml(vm: MessageMetadataViewModel): string {
    const parts: string[] = [`<div class="metadata-drawer-headline">${escapeHtml(vm.headline)}</div>`];
    for (const section of vm.sections) {
      parts.push(`<section class="metadata-section">`);
      parts.push(`<h3 class="metadata-section-title">${escapeHtml(section.title)}</h3>`);
      parts.push(`<dl class="metadata-dl">`);
      for (const r of section.rows) {
        parts.push(`<dt>${escapeHtml(r.label)}</dt>`);
        const cls = r.mono ? "metadata-dd metadata-mono" : "metadata-dd";
        parts.push(`<dd class="${cls}">${escapeHtml(r.value)}</dd>`);
      }
      parts.push(`</dl>`);
      if (section.note) {
        parts.push(`<p class="metadata-note">${escapeHtml(section.note)}</p>`);
      }
      parts.push(`</section>`);
    }
    const json = JSON.stringify(vm.advancedJson, null, 2);
    parts.push(`<details class="metadata-advanced">`);
    parts.push(`<summary>Advanced (raw JSON)</summary>`);
    parts.push(`<pre class="metadata-json">${escapeHtml(json)}</pre>`);
    parts.push(`</details>`);
    return parts.join("");
  }

  return {
    formatCompactNumber,
    computeCacheHitPercent,
    hasDisplayableMetadata,
    readMessageMetadata,
    formatMessageMetadataHtml,
  };
}

const messageMetadataApi = createMessageMetadataApi();

export const formatCompactNumber = messageMetadataApi.formatCompactNumber;
export const computeCacheHitPercent = messageMetadataApi.computeCacheHitPercent;
export const hasDisplayableMetadata = messageMetadataApi.hasDisplayableMetadata;
export const readMessageMetadata = messageMetadataApi.readMessageMetadata;
export const formatMessageMetadataHtml = messageMetadataApi.formatMessageMetadataHtml;

/** Webview script: installs metadata helpers on `window` (self-contained closure). */
export function messageMetadataWebviewScriptBlock(): string {
  return `
    (function () {
      var api = (${createMessageMetadataApi.toString()})();
      window.colcoorHasDisplayableMetadata = api.hasDisplayableMetadata;
      window.colcoorReadMessageMetadata = api.readMessageMetadata;
      window.colcoorFormatMessageMetadataHtml = api.formatMessageMetadataHtml;
    })();
  `;
}
