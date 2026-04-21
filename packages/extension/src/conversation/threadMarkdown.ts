function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Render markdown (GFM-style) to HTML safe for `innerHTML` in the webview.
 */
export function markdownToSafeHtml(markdown: string): string {
  const text = escapeHtml(markdown ?? "");
  return `<pre class="md-fallback">${text}</pre>`;
}
