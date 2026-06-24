export const CURSOR_CLI_MODE_ASK = "ask";
export const CURSOR_CLI_MODES = [CURSOR_CLI_MODE_ASK, "agent", "plan"] as const;

export type CursorCliMode = (typeof CURSOR_CLI_MODES)[number];

export function normalizeCursorCliMode(raw: string | undefined): CursorCliMode {
  const t = raw?.trim();
  return CURSOR_CLI_MODES.some((mode) => mode === t) ? (t as CursorCliMode) : CURSOR_CLI_MODE_ASK;
}
