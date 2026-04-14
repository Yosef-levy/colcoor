/**
 * Normalize line endings to Unix `\n`, then trim. Use before persisting user-authored
 * main-thread text or notes so stored content matches backend conventions (see api-contracts).
 */
export function normalizePersistedUserInputText(raw: string): string {
  return String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * Optional graph / event UUID from QuickPick, commands, or webview: same rules as
 * {@link normalizePersistedUserInputText}. Blank after normalization → `undefined`
 * so callers can fall back (e.g. default branch tip).
 */
export function normalizeOptionalGraphEventId(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const normalized = normalizePersistedUserInputText(raw);
  return normalized === "" ? undefined : normalized;
}
