/**
 * Tree node `created_at` label ([tree-ui-contract.md] §7).
 *
 * - If the timestamp is in the last hour (before `nowMs`): relative minutes, or `just now` under one minute.
 * - Otherwise: local `hh:mm DD/MM/YYYY`.
 */
export function formatTreeEventTimeLabel(iso: string | null | undefined, nowMs: number): string {
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
  const sec = Math.floor((nowMs - t) / 1000);
  if (sec < 0) {
    return "";
  }
  if (sec < 60) {
    return "just now";
  }
  if (sec < 3600) {
    const mins = Math.floor(sec / 60);
    return mins === 1 ? "1 minute ago" : `${mins} minutes ago`;
  }
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const YYYY = d.getFullYear();
  return `${hh}:${mm} ${DD}/${MM}/${YYYY}`;
}

/**
 * Webview script: defines `eventTimeLabel(iso)` using the same implementation as the host
 * (via `Function.prototype.toString()`), so Vitest covers the logic used in the tree UI.
 */
export function treeEventTimeLabelWebviewScriptBlock(): string {
  const impl = formatTreeEventTimeLabel.toString();
  return `
    function eventTimeLabel(iso) {
      var formatTreeEventTimeLabel = ${impl};
      return formatTreeEventTimeLabel(iso, Date.now());
    }
  `;
}
