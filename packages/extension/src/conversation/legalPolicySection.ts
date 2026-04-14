/**
 * Optional Terms / Privacy / Refund links for the About webview ([ui-features.md] §1.3).
 */

export type LegalPolicyUrls = {
  termsUrl?: string;
  privacyUrl?: string;
  refundUrl?: string;
};

/** Normalize workspace setting strings into {@link LegalPolicyUrls} (trimmed non-empty only). */
export function coerceLegalPolicyUrls(input: {
  termsUrl?: string | null | undefined;
  privacyUrl?: string | null | undefined;
  refundUrl?: string | null | undefined;
}): LegalPolicyUrls {
  const out: LegalPolicyUrls = {};
  const t = typeof input.termsUrl === "string" ? input.termsUrl.trim() : "";
  if (t) {
    out.termsUrl = t;
  }
  const p = typeof input.privacyUrl === "string" ? input.privacyUrl.trim() : "";
  if (p) {
    out.privacyUrl = p;
  }
  const r = typeof input.refundUrl === "string" ? input.refundUrl.trim() : "";
  if (r) {
    out.refundUrl = r;
  }
  return out;
}

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

/** Ordered link rows for webviews / state payloads (only http(s) URLs). */
export function listLegalPolicyLinksForWebview(urls: LegalPolicyUrls): { label: string; url: string }[] {
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
  return rows;
}

/**
 * Read `colcoor.legal*` workspace settings via a configuration section’s `.get`
 * and return safe http(s) link rows for webviews ([ui-features.md] §1.3).
 */
export function listLegalPolicyLinksFromColcoorWorkspaceSection(section: {
  get: (key: string) => unknown;
}): { label: string; url: string }[] {
  const urls = coerceLegalPolicyUrls({
    termsUrl: section.get("legalTermsUrl") as string | null | undefined,
    privacyUrl: section.get("legalPrivacyUrl") as string | null | undefined,
    refundUrl: section.get("legalRefundUrl") as string | null | undefined,
  });
  return listLegalPolicyLinksForWebview(urls);
}

/** Returns HTML fragment (no outer wrapper) or empty string. */
export function buildLegalPolicySectionHtml(urls: LegalPolicyUrls): string {
  const rows = listLegalPolicyLinksForWebview(urls);
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
