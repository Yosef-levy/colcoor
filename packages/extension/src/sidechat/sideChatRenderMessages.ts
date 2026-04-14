import type { SideChatMessageOut } from "../api/client";
import { markdownToSafeHtml } from "../conversation/threadMarkdown";
import { extractSideChatMentions } from "./sideChatMentions";
import { resolveSideChatReferencePreview } from "./sideChatReferences";

export type SideChatRenderMessage = SideChatMessageOut & {
  rendered_body_html: string;
  referenced_side_chat_preview: { seq: number; text: string } | null;
  mentions: string[];
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
    referenced_side_chat_preview: resolveSideChatReferencePreview(
      messages,
      m.referenced_side_chat_message_id,
    ),
    mentions: extractSideChatMentions(m.body),
  }));
}
