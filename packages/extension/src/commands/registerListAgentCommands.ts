import * as vscode from "vscode";

import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";
import {
  conversationIdFromCommandArg,
  type ConversationCommandArg,
} from "../conversations/conversationCommandArg";

export function registerListAgentCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const { api, isReady, listAgentJobs, conversationPanel, pickConversationInteractively } = deps;

  async function resolveConversationId(arg?: ConversationCommandArg): Promise<string | undefined> {
    const fromArg = conversationIdFromCommandArg(arg);
    if (fromArg) return fromArg;
    const openId = conversationPanel.getLoadedConversationId?.();
    if (typeof openId === "string" && openId) return openId;
    const picked = await pickConversationInteractively();
    return picked?.id;
  }

  return [
    vscode.commands.registerCommand(
      "colcoor.buildListFromConversation",
      async (arg?: ConversationCommandArg) => {
        if (!(await isReady())) {
          void vscode.window.showWarningMessage("Colcoor: sign in or enable local mode first.");
          return;
        }
        const conversationId = await resolveConversationId(arg);
        if (!conversationId) return;

        const criteria = await vscode.window.showInputBox({
          title: "Build list from conversation",
          prompt: "Criteria for extracting list items (e.g. all literature references)",
          ignoreFocusOut: true,
        });
        if (criteria == null || !criteria.trim()) return;

        const listName = await vscode.window.showInputBox({
          title: "New list name",
          prompt: "Name for the list that will receive accepted items",
          value: "Agent list",
          ignoreFocusOut: true,
        });
        if (listName == null || !listName.trim()) return;

        let currentUserId: string | null = null;
        try {
          const me = await api.getMe();
          currentUserId = me.id;
        } catch {
          currentUserId = "local-user";
        }

        await listAgentJobs.startAndOpenBuilder({
          conversationId,
          requestText: criteria.trim(),
          targetListName: listName.trim(),
          currentUserId,
        });
      },
    ),

    vscode.commands.registerCommand(
      "colcoor.runAgentOnLists",
      async (arg?: ConversationCommandArg) => {
        if (!(await isReady())) {
          void vscode.window.showWarningMessage("Colcoor: sign in or enable local mode first.");
          return;
        }
        const conversationId = await resolveConversationId(arg);
        if (!conversationId) return;

        const bundle = await api.listConversationLists(conversationId);
        if (bundle.lists.length === 0) {
          void vscode.window.showInformationMessage("Colcoor: no lists in this conversation.");
          return;
        }
        const picked = await vscode.window.showQuickPick(
          bundle.lists.map((l) => ({
            label: l.name,
            description: `${l.item_count} items`,
            listId: l.id,
            picked: true,
          })),
          {
            title: "Select lists for the operator agent",
            canPickMany: true,
            ignoreFocusOut: true,
          },
        );
        if (!picked || picked.length === 0) return;

        const request = await vscode.window.showInputBox({
          title: "Run agent on lists",
          prompt: "What should the agent do with these lists?",
          ignoreFocusOut: true,
        });
        if (request == null || !request.trim()) return;

        let currentUserId: string | null = null;
        try {
          const me = await api.getMe();
          currentUserId = me.id;
        } catch {
          currentUserId = "local-user";
        }

        await listAgentJobs.startAndOpenOperator({
          conversationId,
          requestText: request.trim(),
          listIds: picked.map((p) => p.listId),
          currentUserId,
        });
      },
    ),

    vscode.commands.registerCommand("colcoor.openListAgentJobs", async () => {
      await listAgentJobs.pickAndOpenJob();
    }),
  ];
}
