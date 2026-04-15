import type { SideChatMessageOut } from "../api/client";
import { markdownToSafeHtml } from "../conversation/threadMarkdown";
import { extractSideChatMentions } from "./sideChatMentions";
import { sideChatReferenceChips } from "./sideChatReferenceChips";
import { resolveSideChatReferencePreview } from "./sideChatReferences";

export type SideChatRenderMessage = SideChatMessageOut & {
  rendered_body_html: string;
  referenced_side_chat_preview: { seq: number; text: string } | null;
  reference_chips: string[];
  mentions: string[];
};

type ReferenceLabelLookups = {
  eventLabelsById?: Record<string, string>;
  noteLabelsById?: Record<string, string>;
};

function escapeHtmlAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function userMediaFiguresHtml(urls: readonly string[] | undefined): string {
  if (!urls?.length) {
    return "";
  }
  return urls
    .map(
      (u) =>
        `<figure class="msg-user-image"><img src="${escapeHtmlAttr(u)}" alt="User image" /></figure>`,
    )
    .join("");
}

function renderUserMessageBodyHtml(
  m: SideChatMessageOut,
  imageUrls: readonly string[] | undefined,
): string {
  const hasText = Boolean(m.body?.trim());
  const figs = userMediaFiguresHtml(imageUrls);
  if (m.kind !== "user") {
    return markdownToSafeHtml(m.body?.trim() ? (m.body as string) : "(empty)");
  }
  if (!hasText && !figs) {
    return markdownToSafeHtml("(empty)");
  }
  const textPart = hasText ? markdownToSafeHtml(m.body as string) : "";
  return textPart + figs;
}

/**
 * Converts API rows to webview render rows with sanitized markdown HTML.
 */
export function toSideChatRenderMessages(
  messages: readonly SideChatMessageOut[],
  referenceLookups?: ReferenceLabelLookups,
  userImageDataUrlsByMessageId?: ReadonlyMap<string, readonly string[]>,
): SideChatRenderMessage[] {
  return messages.map((m) => ({
    ...m,
    rendered_body_html: renderUserMessageBodyHtml(m, userImageDataUrlsByMessageId?.get(m.id)),
    referenced_side_chat_preview: resolveSideChatReferencePreview(
      messages,
      m.referenced_side_chat_message_id,
    ),
    reference_chips: sideChatReferenceChips(m, referenceLookups),
    mentions: extractSideChatMentions(m.body),
  }));
}
