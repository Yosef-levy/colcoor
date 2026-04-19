import * as vscode from "vscode";

import { TYPED_DELETE_CONFIRM_TOKEN } from "./destructiveDeleteCount";

/**
 * Ask the user to type `DELETE` (case sensitive). Returns false if cancelled or wrong text.
 */
export async function confirmDestructiveActionByTypingDelete(options: {
  title: string;
  prompt: string;
}): Promise<boolean> {
  const value = await vscode.window.showInputBox({
    title: options.title,
    prompt: options.prompt,
    placeHolder: TYPED_DELETE_CONFIRM_TOKEN,
    ignoreFocusOut: true,
    validateInput: (text) => {
      if (text === TYPED_DELETE_CONFIRM_TOKEN) {
        return undefined;
      }
      return "Type DELETE exactly (case sensitive) to confirm.";
    },
  });
  return value === TYPED_DELETE_CONFIRM_TOKEN;
}
