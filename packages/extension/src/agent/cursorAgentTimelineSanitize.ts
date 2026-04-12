/** Cap stored top-level timeline rows (per assistant event). */
const MAX_TIMELINE_ENTRIES = 400;
/** Cap nested JSON arrays inside one NDJSON object (tool payloads). */
const MAX_NESTED_ARRAY = 500;
const MAX_STRING_LEN = 12_000;
const MAX_DEPTH = 24;

/**
 * Truncate long strings in nested JSON-like values so `content_json` stays bounded.
 */
export function sanitizeForAgentTimeline(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return "[max depth]";
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    if (value.length <= MAX_STRING_LEN) {
      return value;
    }
    return `${value.slice(0, MAX_STRING_LEN)}… [truncated ${value.length - MAX_STRING_LEN} chars]`;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    const cap = Math.min(value.length, MAX_NESTED_ARRAY);
    for (let i = 0; i < cap; i++) {
      out.push(sanitizeForAgentTimeline(value[i], depth + 1));
    }
    if (value.length > MAX_NESTED_ARRAY) {
      out.push({
        type: "colcoor_truncated",
        dropped: value.length - MAX_NESTED_ARRAY,
      });
    }
    return out;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = sanitizeForAgentTimeline(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function appendTimelineEntry(
  timeline: unknown[],
  raw: Record<string, unknown>,
): void {
  if (timeline.length >= MAX_TIMELINE_ENTRIES) {
    if (timeline.length === MAX_TIMELINE_ENTRIES) {
      timeline.push({
        type: "colcoor_truncated",
        message: "Further stream events omitted (limit reached).",
      });
    }
    return;
  }
  timeline.push(sanitizeForAgentTimeline(raw) as Record<string, unknown>);
}
