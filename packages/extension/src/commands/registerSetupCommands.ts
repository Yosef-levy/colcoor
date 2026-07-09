import * as vscode from "vscode";
import { promptStoreCursorAgentApiKey } from "../agent/cursorAgentApiKey";
import { promptStoreProviderApiKey } from "../agent/providerApiKey";
import { setupCursorCliInteractive } from "../agent/cursorCliSetup";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";

export function registerSetupCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const { context, refreshConversationsWelcomeContext } = deps;
  return [
    vscode.commands.registerCommand("colcoor.setProviderApiKey", async () => {
      await promptStoreProviderApiKey(context.secrets);
      await refreshConversationsWelcomeContext();
    }),
    vscode.commands.registerCommand("colcoor.setupCursorCli", async () => {
      await setupCursorCliInteractive();
      await refreshConversationsWelcomeContext();
    }),
    vscode.commands.registerCommand("colcoor.setCursorAgentApiKey", async () => {
      await promptStoreCursorAgentApiKey(context.secrets);
      await refreshConversationsWelcomeContext();
    }),
  ];
}
