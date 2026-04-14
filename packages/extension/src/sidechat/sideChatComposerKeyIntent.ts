export type SideChatComposerKeyEventLike = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
};

/**
 * Side-chat composer behavior: Enter sends, Shift+Enter inserts newline.
 */
export function shouldSendSideChatOnKeydown(ev: SideChatComposerKeyEventLike): boolean {
  if (ev.key !== "Enter") {
    return false;
  }
  if (ev.isComposing) {
    return false;
  }
  if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) {
    return false;
  }
  return true;
}
