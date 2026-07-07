import * as vscode from "vscode";
import type { ColcoorClient, ConversationSummary } from "../api/client";
import type { ConversationCommandArg } from "../conversations/conversationCommandArg";
import {
  conversationDisplayTitleFromCommandArg,
  conversationIdFromCommandArg,
} from "../conversations/conversationCommandArg";
import type { PickedConversation } from "../activation/colcoorExtensionDeps";
import type { ConversationPanelController } from "../activation/colcoorExtensionDeps";
import { getConversationDrawersPanelHtml } from "./drawersPanelHtml";
import { isSafeHttpUrlForWebview, listLegalPolicyLinksFromColcoorWorkspaceSection } from "./legalPolicySection";
import { buildConversationDrawersModel } from "./drawersModel";
import { sideChatOpenButtonCopy } from "./sideChatOpenButtonLabel";
import {
  formatColcoorDrawersChromeTitle,
  shouldCloseDrawersAfterConversationDelete,
} from "./drawersChromeTitle";
import { listConversationsCached } from "../conversations/conversationsListCache";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";

export type DrawersPanelControllerOptions = {
  api: ColcoorClient;
  conversationPanel: ConversationPanelController;
  isReady: () => Promise<boolean>;
  pickConversationInteractively: () => Promise<PickedConversation | undefined>;
};

export type DrawersPanelController = {
  isOpen: () => boolean;
  refreshFromServer: () => Promise<void>;
  open: (arg?: ConversationCommandArg) => Promise<void>;
  onConversationRenamed: (convId: string, title: string | null) => void;
  closeIfShowingConversation: (convId: string) => void;
};

export function createDrawersPanelController(
  context: vscode.ExtensionContext,
  options: DrawersPanelControllerOptions,
): DrawersPanelController {
  const { api, conversationPanel, isReady, pickConversationInteractively } = options;

  let drawersPanel: vscode.WebviewPanel | undefined;
  let drawersConversationId: string | undefined;
  let drawersConversationTitle: string | null = null;
  /** Active Collections tab in the drawers webview; kept for server reloads ([ui-features.md] §11). */
  let drawersPreferredTab: "starred" | "todo" | "lists" = "starred";

  async function refreshFromServer(): Promise<void> {
    if (!drawersPanel || !drawersConversationId) {
      return;
    }
    const [{ events }, notes, listsBundle, rows] = await Promise.all([
      api.getTree(drawersConversationId),
      api.listNotes(drawersConversationId),
      api.listConversationLists(drawersConversationId).catch(() => ({ lists: [], items: [] })),
      listConversationsCached(api).catch((): ConversationSummary[] => []),
    ]);
    const model = buildConversationDrawersModel(events, notes, listsBundle.lists, listsBundle.items);
    const row = rows.find((r) => r.id === drawersConversationId);
    const sideChatBtn = row
      ? sideChatOpenButtonCopy(row)
      : sideChatOpenButtonCopy({ side_chat_has_unread: false, side_chat_unread_count: 0 });
    drawersPanel.webview.html = getConversationDrawersPanelHtml(
      drawersPanel.webview.cspSource,
      String(Date.now()),
      model,
      drawersPreferredTab,
      listLegalPolicyLinksFromColcoorWorkspaceSection(vscode.workspace.getConfiguration("colcoor")),
      sideChatBtn,
    );
  }

  function ensureWebviewMessageHandler(): void {
    if (!drawersPanel) {
      return;
    }
    drawersPanel.webview.onDidReceiveMessage(async (m: unknown) => {
      const msg = m as { type?: string; eventId?: string; url?: string; tab?: string };
      if (!msg || typeof msg.type !== "string") {
        return;
      }
      if (msg.type === "openLegalPolicyUrl" && typeof msg.url === "string") {
        const u = msg.url.trim();
        if (isSafeHttpUrlForWebview(u)) {
          void vscode.env.openExternal(vscode.Uri.parse(u));
        }
        return;
      }
      if (
        msg.type === "drawersPreferredTab" &&
        (msg.tab === "starred" || msg.tab === "todo" || msg.tab === "lists")
      ) {
        drawersPreferredTab = msg.tab;
        return;
      }
      if (msg.type === "reloadDrawersLists") {
        if (!drawersConversationId) {
          return;
        }
        try {
          await refreshFromServer();
          void vscode.window.setStatusBarMessage("Colcoor: drawers lists refreshed.", 2000);
        } catch (e) {
          await showColcoorApiFailure(e);
        }
        return;
      }
      if (msg.type === "signIn") {
        await vscode.commands.executeCommand("colcoor.signIn");
        return;
      }
      if (msg.type === "signOut") {
        await vscode.commands.executeCommand("colcoor.signOut");
        return;
      }
      if (msg.type === "openColcoorHub") {
        await vscode.commands.executeCommand("colcoor.showColcoorMenu");
        return;
      }
      if (msg.type === "openConversation") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand(
          "colcoor.openConversation",
          drawersConversationId,
          drawersConversationTitle ?? null,
        );
        return;
      }
      if (msg.type === "openSideChat") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.openSideChat", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        try {
          await refreshFromServer();
        } catch {
          /* unread label is best-effort */
        }
        return;
      }
      if (msg.type === "sendMessage") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.sendMessage", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "stopGeneration") {
        await vscode.commands.executeCommand("colcoor.stopGeneration");
        return;
      }
      if (msg.type === "copySelectedMessage") {
        await vscode.commands.executeCommand("colcoor.copySelectedMessage");
        return;
      }
      if (msg.type === "resendAssistant") {
        await vscode.commands.executeCommand("colcoor.resendAssistant");
        return;
      }
      if (msg.type === "jumpToLatestInConversation") {
        await vscode.commands.executeCommand("colcoor.jumpToLatestInConversation");
        return;
      }
      if (msg.type === "listTodoNotesInConversation") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.listTodoNotesInConversation", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "listStarredMessagesInConversation") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.listStarredMessagesInConversation", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "listConversationMembers") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.listConversationMembers", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "addConversationMember") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.addConversationMember", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "renameConversation") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.renameConversation", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "togglePinnedConversation") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.togglePinnedConversation", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "changeMemberRole") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.changeMemberRole", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "removeMemberFromConversation") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.removeMemberFromConversation", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "deleteConversationFromDrawers") {
        if (!drawersConversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.deleteConversation", {
          conv: {
            id: drawersConversationId,
            title: drawersConversationTitle ?? null,
          },
        });
        return;
      }
      if (msg.type === "refreshConversations") {
        await vscode.commands.executeCommand("colcoor.refreshConversations");
        return;
      }
      if (msg.type === "refreshConversationTree") {
        await vscode.commands.executeCommand("colcoor.refreshConversationTree");
        return;
      }
      if (msg.type === "toggleConversationsSidebar") {
        await vscode.commands.executeCommand("colcoor.toggleConversationsSidebar");
        return;
      }
      if (msg.type === "newConversation") {
        await vscode.commands.executeCommand("colcoor.newConversation");
        return;
      }
      if (msg.type !== "openEvent" || typeof msg.eventId !== "string") {
        return;
      }
      if (!drawersConversationId) {
        return;
      }
      await conversationPanel.revealAtEvent(
        drawersConversationId,
        drawersConversationTitle ?? null,
        msg.eventId,
      );
    });
  }

  async function open(arg?: ConversationCommandArg): Promise<void> {
    if (!(await isReady())) {
      await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
      return;
    }
    let convId = conversationIdFromCommandArg(arg);
    let convTitle: string | null | undefined = conversationDisplayTitleFromCommandArg(arg);
    const preferredTab =
      arg && typeof arg === "object" && "preferredTab" in arg && arg.preferredTab === "todo"
        ? "todo"
        : arg && typeof arg === "object" && "preferredTab" in arg && arg.preferredTab === "lists"
          ? "lists"
          : "starred";
    if (!convId) {
      const row = await pickConversationInteractively();
      if (!row) {
        return;
      }
      convId = row.id;
      convTitle = row.title;
    }
    try {
      const [{ events }, notes, listsBundle, rows] = await Promise.all([
        api.getTree(convId),
        api.listNotes(convId),
        api.listConversationLists(convId).catch(() => ({ lists: [], items: [] })),
        listConversationsCached(api).catch((): ConversationSummary[] => []),
      ]);
      const model = buildConversationDrawersModel(events, notes, listsBundle.lists, listsBundle.items);
      const row = rows.find((r) => r.id === convId);
      const sideChatBtn = row
        ? sideChatOpenButtonCopy(row)
        : sideChatOpenButtonCopy({ side_chat_has_unread: false, side_chat_unread_count: 0 });
      drawersConversationId = convId;
      drawersConversationTitle = convTitle ?? null;
      drawersPreferredTab = preferredTab;
      if (!drawersPanel) {
        drawersPanel = vscode.window.createWebviewPanel(
          "colcoor.drawers",
          "Colcoor — Drawers",
          vscode.ViewColumn.Beside,
          { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] },
        );
        drawersPanel.onDidDispose(() => {
          drawersPanel = undefined;
          drawersConversationId = undefined;
          drawersConversationTitle = null;
          drawersPreferredTab = "starred";
        });
        ensureWebviewMessageHandler();
      }
      drawersPanel.title = formatColcoorDrawersChromeTitle(convTitle ?? null);
      drawersPanel.webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri] };
      drawersPanel.webview.html = getConversationDrawersPanelHtml(
        drawersPanel.webview.cspSource,
        String(Date.now()),
        model,
        drawersPreferredTab,
        listLegalPolicyLinksFromColcoorWorkspaceSection(vscode.workspace.getConfiguration("colcoor")),
        sideChatBtn,
      );
      drawersPanel.reveal(vscode.ViewColumn.Beside, false);
    } catch (e) {
      await showColcoorApiFailure(e);
    }
  }

  return {
    isOpen: () => Boolean(drawersPanel && drawersConversationId),
    refreshFromServer,
    open,
    onConversationRenamed: (convId: string, title: string | null): void => {
      if (drawersPanel && drawersConversationId === convId) {
        drawersConversationTitle = title;
        drawersPanel.title = formatColcoorDrawersChromeTitle(title);
      }
    },
    closeIfShowingConversation: (convId: string): void => {
      if (drawersPanel && shouldCloseDrawersAfterConversationDelete(drawersConversationId, convId)) {
        drawersPanel.dispose();
      }
    },
  };
}
