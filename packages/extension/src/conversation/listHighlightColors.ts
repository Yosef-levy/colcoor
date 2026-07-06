/** Preset highlight colors for conversation Lists — rows × hue (hex stored on the list row). */
export const LIST_HIGHLIGHT_COLOR_GRID: readonly (readonly string[])[] = [
  ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"],
  ["#ec4899", "#14b8a6", "#f59e0b", "#10b981", "#84cc16", "#64748b"],
] as const;

export function flattenListHighlightColorGrid(
  grid: readonly (readonly string[])[] = LIST_HIGHLIGHT_COLOR_GRID,
): string[] {
  const out: string[] = [];
  for (const row of grid) {
    for (const color of row) {
      if (color && !out.includes(color)) out.push(color);
    }
  }
  return out;
}
