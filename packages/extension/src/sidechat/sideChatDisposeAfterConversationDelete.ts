/**
 * `colcoor.deleteConversation` resolves to `true` only after the API delete succeeds
 * ([extension.ts] registerCommand). Side chat uses this to dispose the webview panel.
 */
export function shouldDisposeSideChatPanelAfterDelete(deleteCommandResult: unknown): boolean {
  return deleteCommandResult === true;
}
