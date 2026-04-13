/** Persisted vertical size for the conversation webview composer textarea ([ui-features.md] §5). */

export const COMPOSER_TEXTAREA_MIN_PX = 72;
export const COMPOSER_TEXTAREA_MAX_PX = 800;

/** Workspace-state key; same family as tree width. */
export const COMPOSER_TEXTAREA_HEIGHT_STATE_KEY = "colcoor.conversation.composerTextareaHeightPx";

/**
 * Validates a pixel height from the webview or workspace.
 * Returns null when out of range or non-finite.
 */
export function clampComposerTextareaHeightPx(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  const h = Math.floor(raw);
  if (h < COMPOSER_TEXTAREA_MIN_PX || h > COMPOSER_TEXTAREA_MAX_PX) {
    return null;
  }
  return h;
}
