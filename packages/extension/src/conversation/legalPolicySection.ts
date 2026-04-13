/**
 * Optional Terms / Privacy / Refund links for the About webview ([ui-features.md] §1.3).
 */

export type LegalPolicyUrls = {
  termsUrl?: string;
  privacyUrl?: string;
  refundUrl?: string;
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only http(s) URLs; blocks javascript:, data:, etc. */
export function isSafeHttpUrlForWebview(raw: string): boolean {
  const u = raw.trim();
  if (!u) {
    return false;
  }
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Returns HTML fragment (no outer wrapper) or empty string. */
export function buildLegalPolicySectionHtml(urls: LegalPolicyUrls): string {
  const rows: { label: string; url: string }[] = [];
  const t = urls.termsUrl?.trim();
  if (t && isSafeHttpUrlForWebview(t)) {
    rows.push({ label: "Terms", url: t });
  }
  const p = urls.privacyUrl?.trim();
  if (p && isSafeHttpUrlForWebview(p)) {
    rows.push({ label: "Privacy", url: p });
  }
  const r = urls.refundUrl?.trim();
  if (r && isSafeHttpUrlForWebview(r)) {
    rows.push({ label: "Refund policy", url: r });
  }
  if (rows.length === 0) {
    return "";
  }
  const lis = rows
    .map(
      (row) =>
        `<li><a href="${escapeHtml(row.url)}" rel="noopener noreferrer">${escapeHtml(row.label)}</a></li>`,
    )
    .join("");
  return `<h2 class="muted">Policies</h2><ul>${lis}</ul>`;
}
