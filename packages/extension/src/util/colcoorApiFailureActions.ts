/**
 * Labels on API error toast actions — must match `package.json` `commands[].title` ([ui-features.md] §12).
 * Kept vscode-free so tests can import without mocking the editor API.
 */
export const COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION = "Colcoor: Open settings";
export const COLOOR_API_FAILURE_OPEN_ABOUT_ACTION = "Colcoor: About";
export const COLOOR_API_FAILURE_SIGN_IN_ACTION = "Colcoor: Sign in";
export const COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION = "Colcoor: Refresh conversations";
/** Same title as the stale-tree warning action in the conversation panel ([ui-features.md] §11). */
export const COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION = "Colcoor: Refresh conversation tree";

/**
 * Visible label on in-panel buttons (conversation webview, drawers) — same words as the command title
 * without the `Colcoor: ` prefix so the UI stays compact.
 */
export const COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL = "Refresh conversation tree";
