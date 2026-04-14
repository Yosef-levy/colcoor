/**
 * Workspace persistence for the side-chat composer textarea height ([ui-features.md] §5).
 * Bounds match the side-chat webview ResizeObserver / localStorage clamp.
 */

export const SIDECHAT_COMPOSER_TEXTAREA_HEIGHT_STATE_KEY = "colcoor.sideChatComposerTextareaHeightPx";

export const SIDECHAT_COMPOSER_TEXTAREA_MIN_PX = 64;
export const SIDECHAT_COMPOSER_TEXTAREA_MAX_PX = 520;

export function clampSideChatComposerTextareaHeightPx(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  const h = Math.floor(raw);
  if (h < SIDECHAT_COMPOSER_TEXTAREA_MIN_PX || h > SIDECHAT_COMPOSER_TEXTAREA_MAX_PX) {
    return null;
  }
  return h;
}
