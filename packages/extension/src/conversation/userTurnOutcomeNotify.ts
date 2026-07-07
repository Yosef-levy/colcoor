import * as vscode from "vscode";
import type { UserTurnResult } from "./runUserTurn";
import type { ConversationPanelController } from "../activation/colcoorExtensionDeps";

export async function notifyUserTurnOutcome(
  result: UserTurnResult,
  refreshTree: () => void,
): Promise<void> {
  refreshTree();
  if (result.cancelled) {
    await vscode.window.showInformationMessage(
      result.assistantText?.trim()
        ? "Colcoor: stopped — partial assistant reply was saved."
        : "Colcoor: stopped — no assistant text was saved.",
    );
  } else if (result.assistantStub === "cli_missing") {
    const choice = await vscode.window.showInformationMessage(
      "Colcoor: message saved. Cursor CLI (`agent`) was not on PATH — only a short placeholder was stored.",
      "Set up Cursor CLI",
      "OK",
    );
    if (choice === "Set up Cursor CLI") {
      await vscode.commands.executeCommand("colcoor.setupCursorCli");
    }
  } else if (result.assistantStub === "explicit") {
    await vscode.window.showInformationMessage(
      "Colcoor: message saved (stub mode — assistant text is a local placeholder).",
    );
  } else {
    const body = result.assistantText ?? "";
    const preview = body.length > 200 ? `${body.slice(0, 200)}…` : body;
    await vscode.window.showInformationMessage(
      `Colcoor: sent. Assistant: ${preview.replace(/\s+/g, " ")}`,
    );
  }
}

/**
 * After a user turn started outside the conversation webview (e.g. new conversation + first
 * message, or “Send message…”), sync the open panel so it does not stay on a pre-turn tree
 * snapshot from the webview `ready` handler.
 */
export async function notifyUserTurnOutcomeAndSyncConversationPanel(
  result: UserTurnResult,
  conversationPanel: ConversationPanelController,
  refreshTree: () => void,
): Promise<void> {
  await conversationPanel.refreshConversationTree({ quiet: true });
  await notifyUserTurnOutcome(result, refreshTree);
}
