import * as vscode from "vscode";
import type { ConversationCommandArg } from "../conversations/conversationCommandArg";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";

export function registerDrawersCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const { drawers } = deps;
  return [
    vscode.commands.registerCommand(
      "colcoor.openConversationDrawers",
      async (arg?: ConversationCommandArg) => {
        await drawers.open(arg);
      },
    ),
  ];
}
