/**
 * Side-chat webview helpers for safe avatar URLs and author labels ([ui-features.md] §1.1).
 * Shared author/avatar helpers for side-chat webviews; covered by `sideChatAuthorWebviewRuntime.test.ts`.
 */
export const SIDECHAT_AUTHOR_WEBVIEW_JS = `
function sideChatHttpsAvatarUrl(url) {
  if (typeof url !== "string") return null;
  var t = String(url).trim();
  if (t.indexOf("https://") !== 0) return null;
  try {
    return new URL(t).protocol === "https:" ? t : null;
  } catch (e) {
    return null;
  }
}
function sideChatMetaBase(m) {
  var del = m.deleted_at ? " · deleted" : "";
  var k = m && m.kind ? String(m.kind) : "";
  return k + del;
}
function sideChatAuthorSuffix(m) {
  if (typeof m.author_display_name === "string" && m.author_display_name.trim())
    return " · " + m.author_display_name.trim();
  if (m.author_user_id) return " · Member";
  return "";
}
`.trim();
