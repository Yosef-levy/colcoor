/**
 * Normalize line endings to Unix `\n`, then trim. Use before persisting user-authored
 * main-thread text or notes so stored content matches backend conventions (see api-contracts).
 */
export function normalizePersistedUserInputText(raw: string): string {
  return String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}
