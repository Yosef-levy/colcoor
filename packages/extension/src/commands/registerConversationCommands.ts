import * as vscode from "vscode";
import { runColcoorUserTurn } from "../conversation/runUserTurn";
import { confirmDestructiveActionByTypingDelete } from "../conversation/destructiveDeleteConfirm";
import {
  type ConversationCommandArg,
  conversationDisplayTitleFromCommandArg,
  conversationIdFromCommandArg,
  conversationPinnedFromCommandArg,
  conversationTitleFromCommandArg,
  NO_CONVERSATION_FOR_COMMAND_MESSAGE,
} from "../conversations/conversationCommandArg";
import { listConversationsCached } from "../conversations/conversationsListCache";
import { normalizedOptionalFollowUpPrompt } from "../conversations/newConversationFirstMessage";
import { pickDeletedConversationInteractively } from "../conversations/pickDeletedConversationInteractively";
import { normalizedConversationTitle } from "../conversations/renameConversationTitle";
import { pinnedVerb, toggledPinnedState } from "../conversations/togglePinnedConversation";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";

export function registerConversationCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const {
    api,
    agent,
    conversationPanel,
    refreshTree,
    isReady,
    pickConversationInteractively,
    notifyUserTurnOutcomeAndSyncConversationPanel,
    drawers,
  } = deps;
  return [
    vscode.commands.registerCommand("colcoor.newConversation", async () => {
      const title = await vscode.window.showInputBox({
        title: "New Colcoor conversation",
        prompt: "Title (leave blank for untitled)",
        ignoreFocusOut: true,
      });
      if (title === undefined) {
        return;
      }
      const firstMessageRaw = await vscode.window.showInputBox({
        title: "New Colcoor conversation",
        prompt:
          "Optional first message to the assistant — press Enter to confirm or Esc to skip (you can send the first message later).",
        ignoreFocusOut: true,
      });
      const firstMessage = normalizedOptionalFollowUpPrompt(firstMessageRaw);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
      try {
        const conv = await api.createConversation({ title: normalizedConversationTitle(title) });
        refreshTree();
        await conversationPanel.reveal(conv.id, conv.title);
        await conversationPanel.armTryThisNextForConversation(conv.id);
        if (firstMessage) {
          const result = await runColcoorUserTurn(
            api,
            agent,
            conv.id,
            conv.title,
            firstMessage,
            workspaceRoot,
          );
          await notifyUserTurnOutcomeAndSyncConversationPanel(result);
        } else {
          await vscode.window.showInformationMessage(
            `Colcoor: created "${conv.title ?? "(untitled)"}".`,
          );
        }
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
    vscode.commands.registerCommand("colcoor.refreshConversations", () => {
      refreshTree();
      void vscode.window.setStatusBarMessage("Colcoor: conversations list refreshed.", 2500);
    }),
    vscode.commands.registerCommand("colcoor.refreshConversationDrawers", async () => {
      if (!(await isReady())) {
        await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
        return;
      }
      if (!drawers.isOpen()) {
        await vscode.window.showWarningMessage(
          "Colcoor: open conversation drawers first (Colcoor: Open conversation drawers…).",
        );
        return;
      }
      try {
        await drawers.refreshFromServer();
        void vscode.window.setStatusBarMessage("Colcoor: drawers lists refreshed.", 2500);
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
    vscode.commands.registerCommand(
      "colcoor.copyConversationId",
      async (item?: ConversationCommandArg) => {
        const id = conversationIdFromCommandArg(item);
        if (!id) {
          await vscode.window.showWarningMessage(NO_CONVERSATION_FOR_COMMAND_MESSAGE);
          return;
        }
        await vscode.env.clipboard.writeText(id);
        await vscode.window.showInformationMessage("Colcoor: conversation ID copied.");
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.deleteConversation",
      async (item?: ConversationCommandArg): Promise<boolean> => {
        const id = conversationIdFromCommandArg(item);
        const title = conversationTitleFromCommandArg(item);
        if (!id) {
          await vscode.window.showWarningMessage(NO_CONVERSATION_FOR_COMMAND_MESSAGE);
          return false;
        }
        const choice = await vscode.window.showWarningMessage(
          `Delete conversation “${title}”? The tree is hidden from Colcoor; you can undo for a few minutes (same as message branch delete).`,
          { modal: true, detail: id },
          "Delete",
        );
        if (choice !== "Delete") {
          return false;
        }
        let liveMessageCount = 0;
        try {
          const tree = await api.getTree(id);
          liveMessageCount = tree.events.length;
        } catch {
          /* still require typed confirm below */
        }
        const typedOk = await confirmDestructiveActionByTypingDelete({
          title: "Colcoor — confirm conversation delete",
          prompt:
            liveMessageCount > 0
              ? `This conversation has ${liveMessageCount} message(s) in the tree. Type DELETE to confirm.`
              : "Type DELETE (case sensitive) to confirm deleting this conversation.",
        });
        if (!typedOk) {
          return false;
        }
        try {
          const out = await api.deleteConversation(id);
          conversationPanel.closeIfShowingConversation(id);
          drawers.closeIfShowingConversation(id);
          refreshTree();
          void vscode.window.setStatusBarMessage("Colcoor: conversation deleted.", 2500);
          if (out.deleted_count > 0 && out.deletion_group_id) {
            const undoPick = await vscode.window.showInformationMessage(
              "Colcoor: conversation deleted.",
              "Undo",
            );
            if (undoPick === "Undo") {
              try {
                await api.undoEventDeletion(id, out.deletion_group_id);
                void vscode.window.setStatusBarMessage("Colcoor: deletion undone.", 2500);
                refreshTree();
              } catch (undoErr) {
                void showColcoorApiFailure(undoErr);
              }
            }
          }
          return true;
        } catch (e) {
          await showColcoorApiFailure(e);
          return false;
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.restoreDeletedConversation",
      async (item?: ConversationCommandArg) => {
        if (!(await isReady())) {
          await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
          return;
        }
        let convId = conversationIdFromCommandArg(item);
        let convTitle: string | null | undefined = conversationDisplayTitleFromCommandArg(item);
        if (!convId) {
          const row = await pickDeletedConversationInteractively(api);
          if (!row) {
            return;
          }
          convId = row.id;
          convTitle = row.title;
        }
        try {
          const out = await api.restoreDeletedConversation(convId);
          refreshTree();
          await conversationPanel.reveal(convId, convTitle ?? null);
          void vscode.window.setStatusBarMessage(
            `Colcoor: restored ${out.restored_count} message(s) in “${convTitle?.trim() ? convTitle : "(untitled)"}”.`,
            3500,
          );
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.renameConversation",
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
        const next = await vscode.window.showInputBox({
          title: "Colcoor — rename conversation",
          prompt: "Leave blank for untitled",
          value: convTitle ?? "",
          ignoreFocusOut: true,
        });
        if (next === undefined) {
          return;
        }
        try {
          const out = await api.patchConversation(convId, {
            title: normalizedConversationTitle(next),
          });
          refreshTree();
          drawers.onConversationRenamed(convId, out.title ?? null);
          await vscode.window.showInformationMessage(
            `Colcoor: renamed conversation to ${out.title?.trim() ? `"${out.title}"` : "(untitled)"}.`,
          );
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.togglePinnedConversation",
      async (item?: ConversationCommandArg) => {
        let convId = conversationIdFromCommandArg(item);
        let convTitle: string | null | undefined = conversationDisplayTitleFromCommandArg(item);
        let currentPinned = conversationPinnedFromCommandArg(item);
        if (!convId) {
          const row = await pickConversationInteractively();
          if (!row) {
            return;
          }
          convId = row.id;
          convTitle = row.title;
          currentPinned = row.pinned;
        } else if (currentPinned === undefined) {
          try {
            const rows = await listConversationsCached(api);
            currentPinned = rows.find((r) => r.id === convId)?.pinned;
          } catch {
            currentPinned = false;
          }
        }
        const nextPinned = toggledPinnedState(currentPinned);
        try {
          await api.patchConversation(convId, { pinned: nextPinned });
          refreshTree();
          await vscode.window.showInformationMessage(
            `Colcoor: ${pinnedVerb(nextPinned)} ${convTitle?.trim() ? `"${convTitle}"` : "(untitled)"}.`,
          );
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.openConversation",
      async (arg0?: ConversationCommandArg | string, arg1?: string | null) => {
        if (arg0 && typeof arg0 === "object" && "conv" in arg0) {
          const convId = conversationIdFromCommandArg(arg0);
          if (convId) {
            await conversationPanel.reveal(convId, conversationDisplayTitleFromCommandArg(arg0));
            return;
          }
          const row = await pickConversationInteractively();
          if (row) {
            await conversationPanel.reveal(row.id, row.title);
          }
          return;
        }
        if (typeof arg0 === "string" && arg0.length > 0) {
          await conversationPanel.reveal(arg0, arg1 ?? null);
          return;
        }
        const row = await pickConversationInteractively();
        if (row) {
          await conversationPanel.reveal(row.id, row.title);
        }
      },
    ),
  ];
}
