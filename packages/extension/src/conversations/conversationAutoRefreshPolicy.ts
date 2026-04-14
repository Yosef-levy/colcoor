/**
 * Conversation sidebar auto-refresh interval (kept modest to avoid noisy traffic).
 */
export const CONVERSATION_AUTO_REFRESH_MS = 60_000;

/**
 * Auto-refresh only when the user is signed in and the tree is visible.
 */
export function shouldAutoRefreshConversations(args: {
  hasBackendToken: boolean;
  treeVisible: boolean;
}): boolean {
  return args.hasBackendToken && args.treeVisible;
}
