import * as vscode from "vscode";

import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

/**
 * Opens an untitled editor so the user can type a multiline first message, then confirms.
 * Returns normalized text, or empty when the user skips or leaves the buffer blank.
 */
export async function collectFirstMessageFromUntitledEditor(): Promise<string> {
  const doc = await vscode.workspace.openTextDocument({ language: "plaintext" });
  await vscode.window.showTextDocument(doc, { preview: true });
  const choice = await vscode.window.showInformationMessage(
    "Colcoor: type your optional first message in the editor tab, then confirm.",
    "Use as first message",
    "Skip first message",
  );
  if (choice !== "Use as first message") {
    return "";
  }
  const uriKey = doc.uri.toString();
  const latest = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uriKey);
  return normalizePersistedUserInputText(latest?.getText() ?? "");
}
