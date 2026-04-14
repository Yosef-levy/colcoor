import { markdownToSafeHtml } from "./threadMarkdown";

/**
 * Sanitized HTML for the thread “pending user” row while a send is in flight
 * ([ui-features.md] §7).
 */
export function pendingUserHtmlForPanelState(
  busy: boolean,
  pendingMarkdown: string | undefined,
): string | null {
  if (!busy || pendingMarkdown === undefined) {
    return null;
  }
  try {
    return markdownToSafeHtml(pendingMarkdown);
  } catch {
    return null;
  }
}
