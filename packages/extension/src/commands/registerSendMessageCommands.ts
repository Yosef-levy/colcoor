import * as vscode from "vscode";
import {
  isPrivateBranchFromPrivacyPick,
  sendMessagePrivacyQuickPickItems,
} from "../conversation/sendMessagePalettePrivacy";
import { collectSendMessageBody } from "../conversation/sendMessageBodyCollection";
import type { SendMessageBodyMode } from "../conversation/sendMessageBodyCollection";
import { runColcoorUserTurn } from "../conversation/runUserTurn";
import {
  type ConversationCommandArg,
  conversationDisplayTitleFromCommandArg,
  conversationIdFromCommandArg,
} from "../conversations/conversationCommandArg";
import { collectMultilineTextInUntitledEditor } from "../conversations/firstMessageMultilineEditor";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";

export function registerSendMessageCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const {
    api,
    agent,
    conversationPanel,
    pickConversationInteractively,
    notifyUserTurnOutcomeAndSyncConversationPanel,
  } = deps;
  return [
    vscode.commands.registerCommand("colcoor.stopGeneration", () => {
      conversationPanel.cancelInFlightGeneration();
    }),
    vscode.commands.registerCommand(
      "colcoor.sendMessage",
      async (item?: ConversationCommandArg) => {
        let convId = conversationIdFromCommandArg(item);
        let convTitle: string | null | undefined = conversationDisplayTitleFromCommandArg(item);
        if (!convId) {
          const row = await pickConversationInteractively();
          if (!row) {
            return;
          }
          convId = row.id;
          convTitle = row.title;
        }
        type BodyPick = vscode.QuickPickItem & { mode: SendMessageBodyMode };
        const bodyItems: BodyPick[] = [
          {
            label: "Single-line message…",
            description: "Type in the next input box",
            mode: "single_line",
          },
          {
            label: "Multiline message…",
            description: "Opens a temporary editor tab",
            mode: "multiline_editor",
          },
        ];
        const normalized = await collectSendMessageBody({
          pickMode: async () => {
            const picked = await vscode.window.showQuickPick<BodyPick>(bodyItems, {
              title: "Colcoor — message body",
              placeHolder: "How do you want to enter the message?",
              ignoreFocusOut: true,
            });
            return picked?.mode ?? "single_line";
          },
          promptSingleLine: () =>
            vscode.window.showInputBox({
              title: "Colcoor — message",
              prompt:
                "Your message (attached under the branch tip, then Cursor agent per Settings → Colcoor → agent mode). Next step: shared vs private.",
              ignoreFocusOut: true,
            }),
          getMultilineFromEditor: () =>
            collectMultilineTextInUntitledEditor({
              infoMessage: "Colcoor: type your message in the editor tab, then confirm.",
              useButtonLabel: "Use as message",
              dismissButtonLabel: "Cancel send",
            }),
        });
        if (!normalized) {
          return;
        }
        const privacyPick = await vscode.window.showQuickPick(sendMessagePrivacyQuickPickItems(), {
          title: "Colcoor — send as",
          placeHolder: "Shared (default) or private draft under the branch tip",
          ignoreFocusOut: true,
        });
        const privateBranch = isPrivateBranchFromPrivacyPick(privacyPick);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
        try {
          const result = await runColcoorUserTurn(
            api,
            agent,
            convId,
            convTitle,
            normalized,
            workspaceRoot,
            {
              ...(privateBranch ? { privateBranch: true } : {}),
            },
          );
          await notifyUserTurnOutcomeAndSyncConversationPanel(result);
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
  ];
}
