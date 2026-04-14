import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";
import { normalizedOptionalFollowUpPrompt } from "./newConversationFirstMessage";

/** How the user supplies an optional first message after choosing a title ([ui-features.md] §4). */
export type FirstMessageCollectionMode = "skip" | "single_line" | "multiline_editor";

export type CollectOptionalFirstMessageDeps = {
  pickMode: () => Promise<FirstMessageCollectionMode>;
  /** Used when `pickMode` is `single_line`. `undefined` (Esc) means skip. */
  promptSingleLine: () => Thenable<string | undefined>;
  /** Used when `pickMode` is `multiline_editor`. Return raw editor text (may be empty). */
  getMultilineFromEditor: () => Thenable<string>;
};

/**
 * Optional first message after title entry: skip, single-line prompt, or multiline editor.
 */
export async function collectOptionalFirstMessage(deps: CollectOptionalFirstMessageDeps): Promise<string> {
  const mode = await deps.pickMode();
  if (mode === "skip") {
    return "";
  }
  if (mode === "single_line") {
    const raw = await deps.promptSingleLine();
    return normalizedOptionalFollowUpPrompt(raw);
  }
  const raw = await deps.getMultilineFromEditor();
  return normalizePersistedUserInputText(raw);
}
