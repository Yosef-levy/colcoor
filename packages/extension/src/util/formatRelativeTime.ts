/** Short relative label for ISO 8601 timestamps (sidebar / tooltips). */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") {
    return "";
  }
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) {
    return "";
  }
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 0) {
    return "";
  }
  if (sec < 45) {
    return "just now";
  }
  if (sec < 3600) {
    return `${Math.floor(sec / 60)}m ago`;
  }
  if (sec < 86_400) {
    return `${Math.floor(sec / 3600)}h ago`;
  }
  if (sec < 604_800) {
    return `${Math.floor(sec / 86_400)}d ago`;
  }
  try {
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
