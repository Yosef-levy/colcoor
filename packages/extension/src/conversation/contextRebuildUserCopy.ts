/**
 * User-facing strings when the server sets `needs_context_rebuild` on the caller
 * ([domain-model.md] §4, [ui-features.md] §8). Kept in TypeScript so Vitest can lock wording.
 */

/** Appended to the subtitle under the conversation title (leading space intentional). */
export const CONTEXT_REBUILD_SUBTITLE_SUFFIX =
  " Next send rebuilds assistant context from the full branch path (root → selected).";

/** Shown above the composer while the flag is true and the panel is not busy sending. */
export const CONTEXT_REBUILD_COMPOSER_BANNER =
  "Your next message refreshes assistant context along the full path from the root to the selected message, including any notes added or edited on that path.";
