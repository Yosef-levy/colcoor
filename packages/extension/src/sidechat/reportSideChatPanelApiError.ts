import { isPlanLimitColcoorApiError } from "../api/colcoorApiHttpError";

export type PostSideChatWebviewError = (text: string) => Promise<void>;
export type ShowSideChatHostFailure = (e: unknown) => Promise<void>;

const PLAN_LIMIT_WEBVIEW_HINT =
  "Plan or usage limit — check the dialog, or open Colcoor settings from the command palette.";

/**
 * Side-chat host + webview error reporting: HTTP 402 shows the host paywall modal first, then a short inline hint in the webview.
 */
export async function reportSideChatPanelApiError(
  e: unknown,
  deps: {
    showHostFailure: ShowSideChatHostFailure;
    postWebviewError: PostSideChatWebviewError;
  },
): Promise<void> {
  if (isPlanLimitColcoorApiError(e)) {
    await deps.showHostFailure(e);
    await deps.postWebviewError(PLAN_LIMIT_WEBVIEW_HINT);
    return;
  }
  const t = e instanceof Error ? e.message : String(e);
  await deps.postWebviewError(t);
}
