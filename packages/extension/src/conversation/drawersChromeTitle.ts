/**
 * Webview panel title for the conversation drawers ([ui-features.md] §11).
 */
export function formatColcoorDrawersChromeTitle(conversationTitle: string | null | undefined): string {
  const subtitle = conversationTitle?.trim() ? conversationTitle : "(untitled)";
  return `Colcoor — Drawers · ${subtitle}`;
}

/** When true, disposing the drawers panel matches a conversation that was just deleted. */
export function shouldCloseDrawersAfterConversationDelete(
  openDrawersForConversationId: string | undefined,
  deletedConversationId: string,
): boolean {
  return openDrawersForConversationId !== undefined && openDrawersForConversationId === deletedConversationId;
}
