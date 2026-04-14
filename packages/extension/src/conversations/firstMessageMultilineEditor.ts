import * as vscode from "vscode";

import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

export type CollectMultilineTextInEditorLabels = {
  infoMessage: string;
  useButtonLabel: string;
  dismissButtonLabel: string;
};

/**
 * Opens an untitled editor for multiline user text; returns normalized content or empty if dismissed.
 */
export async function collectMultilineTextInUntitledEditor(
  labels: CollectMultilineTextInEditorLabels,
): Promise<string> {
  const doc = await vscode.workspace.openTextDocument({ language: "plaintext" });
  await vscode.window.showTextDocument(doc, { preview: true });
  const choice = await vscode.window.showInformationMessage(
    labels.infoMessage,
    labels.useButtonLabel,
    labels.dismissButtonLabel,
  );
  if (choice !== labels.useButtonLabel) {
    return "";
  }
  const uriKey = doc.uri.toString();
  const latest = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uriKey);
  return normalizePersistedUserInputText(latest?.getText() ?? "");
}

/**
 * Optional multiline first message on new conversation ([ui-features.md] §4).
 */
export async function collectFirstMessageFromUntitledEditor(): Promise<string> {
  return collectMultilineTextInUntitledEditor({
    infoMessage: "Colcoor: type your optional first message in the editor tab, then confirm.",
    useButtonLabel: "Use as first message",
    dismissButtonLabel: "Skip first message",
  });
}
