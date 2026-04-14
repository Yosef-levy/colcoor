import type { SideChatMessageOut } from "../api/client";
import { markdownToSafeHtml } from "../conversation/threadMarkdown";

export type SideChatRenderMessage = SideChatMessageOut & {
  rendered_body_html: string;
};

/**
 * Converts API rows to webview render rows with sanitized markdown HTML.
 */
export function toSideChatRenderMessages(
  messages: readonly SideChatMessageOut[],
): SideChatRenderMessage[] {
  return messages.map((m) => ({
    ...m,
    rendered_body_html: markdownToSafeHtml(m.body?.trim() ? m.body : "(empty)"),
  }));
}
