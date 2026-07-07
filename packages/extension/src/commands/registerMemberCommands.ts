import * as vscode from "vscode";
import type { ConversationMember } from "../api/client";
import {
  type ConversationCommandArg,
  conversationIdFromCommandArg,
  NO_CONVERSATION_FOR_COMMAND_MESSAGE,
} from "../conversations/conversationCommandArg";
import {
  formatMemberLogLine,
  formatMemberQuickPickLabel,
} from "../conversations/conversationMemberDisplay";
import { runAddConversationMemberFlow } from "../conversations/conversationMemberInviteFlow";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";

export function registerMemberCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const {
    api,
    colcoorLog,
    localMode,
    refreshTree,
    notifyCollaborationDisabledInLocalMode,
  } = deps;
  return [
    vscode.commands.registerCommand(
      "colcoor.listConversationMembers",
      async (item?: ConversationCommandArg) => {
        if (localMode) {
          await notifyCollaborationDisabledInLocalMode("members");
          return;
        }
        const id = conversationIdFromCommandArg(item);
        if (!id) {
          await vscode.window.showWarningMessage(NO_CONVERSATION_FOR_COMMAND_MESSAGE);
          return;
        }
        try {
          const members = await api.listConversationMembers(id);
          colcoorLog.clear();
          colcoorLog.appendLine(`Conversation ${id}`);
          colcoorLog.appendLine("");
          if (members.length === 0) {
            colcoorLog.appendLine("(no members yet)");
          } else {
            for (const m of members) {
              colcoorLog.appendLine(formatMemberLogLine(m));
            }
          }
          colcoorLog.show(true);
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.addConversationMember",
      async (item?: ConversationCommandArg) => {
        if (localMode) {
          await notifyCollaborationDisabledInLocalMode("inviting collaborators");
          return;
        }
        const id = conversationIdFromCommandArg(item);
        if (!id) {
          await vscode.window.showWarningMessage(NO_CONVERSATION_FOR_COMMAND_MESSAGE);
          return;
        }
        await runAddConversationMemberFlow(api, id, refreshTree);
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.changeMemberRole",
      async (item?: ConversationCommandArg) => {
        if (localMode) {
          await notifyCollaborationDisabledInLocalMode("changing member roles");
          return;
        }
        const id = conversationIdFromCommandArg(item);
        if (!id) {
          await vscode.window.showWarningMessage(NO_CONVERSATION_FOR_COMMAND_MESSAGE);
          return;
        }
        try {
          const members = await api.listConversationMembers(id);
          if (members.length === 0) {
            await vscode.window.showInformationMessage(
              "Colcoor: this conversation has no members yet. Add someone with “Add member…”.",
            );
            return;
          }
          type PickRow = vscode.QuickPickItem & { member: ConversationMember };
          const picked = await vscode.window.showQuickPick<PickRow>(
            members.map((m) => ({
              label: formatMemberQuickPickLabel(m),
              description: m.user_id,
              member: m,
            })),
            { title: "Colcoor — member to change role (owner only on server)" },
          );
          if (!picked) {
            return;
          }
          const rolePick = await vscode.window.showQuickPick(
            [
              { label: "Owner (transfers ownership from the current owner)", role: "owner" as const },
              { label: "Editor", role: "editor" as const },
              { label: "Viewer", role: "viewer" as const },
            ],
            { title: "Colcoor — new role", placeHolder: "See permissions in repo docs" },
          );
          if (!rolePick) {
            return;
          }
          await api.patchConversationMemberRole(id, picked.member.user_id, { role: rolePick.role });
          refreshTree();
          await vscode.window.showInformationMessage(
            `Colcoor: updated role to ${rolePick.role} for ${picked.member.user_id}.`,
          );
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.removeMemberFromConversation",
      async (item?: ConversationCommandArg) => {
        if (localMode) {
          await notifyCollaborationDisabledInLocalMode("removing members");
          return;
        }
        const id = conversationIdFromCommandArg(item);
        if (!id) {
          await vscode.window.showWarningMessage(NO_CONVERSATION_FOR_COMMAND_MESSAGE);
          return;
        }
        try {
          const members = await api.listConversationMembers(id);
          const removable = members.filter((m) => m.role !== "owner");
          if (removable.length === 0) {
            await vscode.window.showInformationMessage(
              "Colcoor: there are no members you can remove here (the conversation owner cannot be removed from this menu).",
            );
            return;
          }
          type PickRow = vscode.QuickPickItem & { member: ConversationMember };
          const picked = await vscode.window.showQuickPick<PickRow>(
            removable.map((m) => ({
              label: formatMemberQuickPickLabel(m),
              description: m.user_id,
              member: m,
            })),
            { title: "Colcoor — member to remove (owner only on server)" },
          );
          if (!picked) {
            return;
          }
          const choice = await vscode.window.showWarningMessage(
            `Remove this member from the conversation? They will lose access.`,
            { modal: true, detail: picked.member.user_id },
            "Remove",
          );
          if (choice !== "Remove") {
            return;
          }
          await api.deleteConversationMember(id, picked.member.user_id);
          refreshTree();
          await vscode.window.showInformationMessage("Colcoor: member removed.");
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
  ];
}
