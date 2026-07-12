import * as vscode from "vscode";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";

export function registerMessagePanelCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const { conversationPanel } = deps;
  return [
    vscode.commands.registerCommand("colcoor.toggleStarSelectedMessage", async () => {
      await conversationPanel.toggleStarSelectedMessage();
    }),
    vscode.commands.registerCommand("colcoor.continueFromHere", async () => {
      await conversationPanel.continueFromHere();
    }),
    vscode.commands.registerCommand("colcoor.resendAssistant", async () => {
      await conversationPanel.resendAssistant();
    }),
    vscode.commands.registerCommand("colcoor.jumpToLatestInConversation", async () => {
      await conversationPanel.jumpToLatestInConversation();
    }),
    vscode.commands.registerCommand("colcoor.copySelectedMessage", async () => {
      await conversationPanel.copySelectedMessage();
    }),
    vscode.commands.registerCommand("colcoor.viewMessageMetadata", async () => {
      await conversationPanel.viewMessageMetadata();
    }),
    vscode.commands.registerCommand("colcoor.editUserMessage", async () => {
      await conversationPanel.editUserMessage();
    }),
    vscode.commands.registerCommand("colcoor.refreshConversationTree", async () => {
      await conversationPanel.refreshConversationTree();
    }),
    vscode.commands.registerCommand("colcoor.deleteSelectedMessageSubtree", async () => {
      await conversationPanel.deleteSelectedMessageSubtree();
    }),
    vscode.commands.registerCommand("colcoor.restoreMessageBranch", async () => {
      await conversationPanel.restoreMessageBranchFromPalette();
    }),
    vscode.commands.registerCommand("colcoor.addNoteToSelectedMessage", async () => {
      await conversationPanel.addNoteToSelectedMessage();
    }),
    vscode.commands.registerCommand("colcoor.showNotesOnSelectedMessage", async () => {
      await conversationPanel.showNotesOnSelectedMessage();
    }),
  ];
}
