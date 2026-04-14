import { normalizePersistedUserInputText } from "./normalizeUserInputText";

/** How the user enters the main text for palette `colcoor.sendMessage` ([ui-features.md] §9). */
export type SendMessageBodyMode = "single_line" | "multiline_editor";

export type CollectSendMessageBodyDeps = {
  pickMode: () => Promise<SendMessageBodyMode>;
  /** Used when `pickMode` is `single_line`. `undefined` (Esc) aborts the send. */
  promptSingleLine: () => Thenable<string | undefined>;
  /** Used when `pickMode` is `multiline_editor`. Raw editor text before trim. */
  getMultilineFromEditor: () => Thenable<string>;
};

/**
 * Collects message body for palette send: single-line input box or multiline untitled editor.
 * Returns empty string when the user cancels or leaves no text (caller should not run the turn).
 */
export async function collectSendMessageBody(deps: CollectSendMessageBodyDeps): Promise<string> {
  const mode = await deps.pickMode();
  if (mode === "single_line") {
    const raw = await deps.promptSingleLine();
    if (raw === undefined) {
      return "";
    }
    return normalizePersistedUserInputText(raw);
  }
  const raw = await deps.getMultilineFromEditor();
  return normalizePersistedUserInputText(raw);
}
