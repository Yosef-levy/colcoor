import { normalizeOptionalGraphEventId } from "../conversation/normalizeUserInputText";

/**
 * Side-chat / webview reference fields (event id, note id, message id): trim and CRLF-normalize;
 * blank after normalization → `null`.
 */
export function normalizeSideChatReferenceId(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  return normalizeOptionalGraphEventId(raw) ?? null;
}
