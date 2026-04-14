/**
 * Human-readable `updated_at` for the conversations sidebar tooltip ([ui-features.md] §4).
 * Uses fixed `en-US` + `UTC` so Vitest is stable across machines.
 */
export function formatConversationUpdatedAtForTooltip(iso: string | null | undefined): string {
  if (iso == null) {
    return "";
  }
  const s = String(iso).trim();
  if (!s) {
    return "";
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) {
    return "";
  }
  try {
    return new Date(t).toLocaleString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}
