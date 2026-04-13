import * as vscode from "vscode";
import { ColcoorApiClient } from "./api/client";
import { getAccessTokenInteractive } from "./auth/extensionAccounts";
import type { ColcoorAuthProvider } from "./auth/extensionAccounts";
import { CursorSession } from "./auth/cursorSession";
import { AgentRunner } from "./agent/agentRunner";
import {
  offerCursorAgentApiKeyAfterSignIn,
  promptStoreCursorAgentApiKey,
} from "./agent/cursorAgentApiKey";
import { scheduleCursorCliPresenceCheck, setupCursorCliInteractive } from "./agent/cursorCliSetup";
import { showAboutPanel } from "./conversation/aboutPanel";
import { createConversationPanelController } from "./conversation/conversationPanel";
import { runColcoorUserTurn } from "./conversation/runUserTurn";
import {
  ConversationTreeItem,
  ConversationsTreeProvider,
} from "./conversations/conversationsTreeProvider";

const SECRET_KEY_BACKEND_JWT = "colcoor.backendJwt";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("colcoor");
  const baseUrl = (config.get<string>("backendBaseUrl") ?? "http://127.0.0.1:8000").replace(
    /\/$/,
    "",
  );

  const session = new CursorSession(context.secrets, SECRET_KEY_BACKEND_JWT);
  const api = new ColcoorApiClient({
    baseUrl,
    getAccessToken: () => session.getBackendAccessToken(),
  });
  const agent = new AgentRunner(context.secrets);

  const conversationPanel = createConversationPanelController(context, {
    api,
    agent,
    getWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
  });
  context.subscriptions.push(new vscode.Disposable(() => conversationPanel.dispose()));

  const colcoorLog = vscode.window.createOutputChannel("Colcoor");
  context.subscriptions.push(colcoorLog);

  const treeProvider = new ConversationsTreeProvider(api, async () =>
    Boolean(await session.getBackendAccessToken()),
  );
  const refreshTree = (): void => {
    treeProvider.refresh();
  };

  const treeView = vscode.window.createTreeView("colcoor.conversations", {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  async function pickConversationInteractively(): Promise<
    { id: string; title: string | null } | undefined
  > {
    try {
      const rows = await api.listConversations();
      if (rows.length === 0) {
        await vscode.window.showWarningMessage("Colcoor: no conversations — create one first.");
        return undefined;
      }
      const picked = await vscode.window.showQuickPick<
        vscode.QuickPickItem & { cid: string; ctitle: string | null }
      >(
        rows.map((r) => ({
          label: r.title?.trim() ? r.title : "(untitled)",
          description: r.id,
          cid: r.id,
          ctitle: r.title,
        })),
        { title: "Colcoor — pick conversation", placeHolder: "Choose a conversation" },
      );
      if (!picked) {
        return undefined;
      }
      return { id: picked.cid, title: picked.ctitle };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
      return undefined;
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("colcoor.setupCursorCli", async () => {
      await setupCursorCliInteractive();
    }),
    vscode.commands.registerCommand("colcoor.setCursorAgentApiKey", async () => {
      await promptStoreCursorAgentApiKey(context.secrets);
    }),
  );
  scheduleCursorCliPresenceCheck(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("colcoor.signIn", async () => {
      const items: {
        label: string;
        description: string;
        provider: ColcoorAuthProvider;
      }[] = [
        {
          label: "GitHub",
          description: "If you use GitHub with Cursor",
          provider: "github",
        },
        {
          label: "Microsoft",
          description: "Work, school, or personal Microsoft account",
          provider: "microsoft",
        },
        {
          label: "Google",
          description: "If your Cursor account uses Google",
          provider: "google",
        },
      ];
      const pick = await vscode.window.showQuickPick(items, {
        title: "Colcoor — sign in",
        placeHolder: "Choose the same account type you use in Cursor",
      });
      if (!pick) {
        return;
      }
      const accessToken = await getAccessTokenInteractive(pick.provider);
      if (!accessToken) {
        await vscode.window.showErrorMessage(
          "Colcoor: no access token from Cursor — check that you are signed in to the chosen provider.",
        );
        return;
      }
      try {
        const { access_token: backendJwt } = await api.cursorExchange({
          cursor_access_token: accessToken,
          provider_hint: pick.provider,
        });
        await session.setBackendAccessToken(backendJwt);
        refreshTree();
        await offerCursorAgentApiKeyAfterSignIn(context.secrets);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
      }
    }),
    vscode.commands.registerCommand("colcoor.signOut", async () => {
      await session.clearBackendAccessToken();
      refreshTree();
      await vscode.window.showInformationMessage("Colcoor: signed out.");
    }),
    vscode.commands.registerCommand("colcoor.newConversation", async () => {
      const title = await vscode.window.showInputBox({
        title: "New Colcoor conversation",
        prompt: "Title (leave blank for untitled)",
        ignoreFocusOut: true,
      });
      if (title === undefined) {
        return;
      }
      const trimmed = title.trim();
      try {
        const conv = await api.createConversation({ title: trimmed || null });
        refreshTree();
        await conversationPanel.reveal(conv.id, conv.title);
        await vscode.window.showInformationMessage(
          `Colcoor: created "${conv.title ?? "(untitled)"}".`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
      }
    }),
    vscode.commands.registerCommand("colcoor.refreshConversations", () => {
      refreshTree();
    }),
    vscode.commands.registerCommand(
      "colcoor.copyConversationId",
      async (item?: ConversationTreeItem) => {
        const id = item?.conv?.id;
        if (!id) {
          await vscode.window.showWarningMessage(
            "Colcoor: use the context menu on a conversation in the Colcoor sidebar.",
          );
          return;
        }
        await vscode.env.clipboard.writeText(id);
        await vscode.window.showInformationMessage("Colcoor: conversation ID copied.");
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.listConversationMembers",
      async (item?: ConversationTreeItem) => {
        const id = item?.conv?.id;
        if (!id) {
          await vscode.window.showWarningMessage(
            "Colcoor: use the context menu on a conversation in the Colcoor sidebar.",
          );
          return;
        }
        try {
          const members = await api.listConversationMembers(id);
          colcoorLog.clear();
          colcoorLog.appendLine(`Conversation ${id}`);
          colcoorLog.appendLine("");
          for (const m of members) {
            const name = m.display_name?.trim() ? m.display_name : "—";
            const em = m.email?.trim() ? m.email : "—";
            colcoorLog.appendLine(`  ${m.role.padEnd(8)} ${name}  <${em}>  ${m.user_id}`);
          }
          colcoorLog.show(true);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.deleteConversation",
      async (item?: ConversationTreeItem) => {
        const id = item?.conv?.id;
        const title = item?.conv?.title?.trim() ? item.conv.title : "(untitled)";
        if (!id) {
          await vscode.window.showWarningMessage(
            "Colcoor: use the context menu on a conversation in the Colcoor sidebar.",
          );
          return;
        }
        const choice = await vscode.window.showWarningMessage(
          `Delete conversation “${title}”? This removes the tree and messages from Colcoor and cannot be undone.`,
          { modal: true, detail: id },
          "Delete",
        );
        if (choice !== "Delete") {
          return;
        }
        try {
          await api.deleteConversation(id);
          conversationPanel.closeIfShowingConversation(id);
          refreshTree();
          await vscode.window.showInformationMessage("Colcoor: conversation deleted.");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
        }
      },
    ),
    vscode.commands.registerCommand("colcoor.openAbout", () => {
      showAboutPanel();
    }),
    vscode.commands.registerCommand("colcoor.toggleStarSelectedMessage", async () => {
      await conversationPanel.toggleStarSelectedMessage();
    }),
    vscode.commands.registerCommand("colcoor.addNoteToSelectedMessage", async () => {
      await conversationPanel.addNoteToSelectedMessage();
    }),
    vscode.commands.registerCommand("colcoor.showNotesOnSelectedMessage", async () => {
      await conversationPanel.showNotesOnSelectedMessage();
    }),
    vscode.commands.registerCommand(
      "colcoor.openConversation",
      async (arg0?: ConversationTreeItem | string, arg1?: string | null) => {
        if (arg0 && typeof arg0 === "object" && "conv" in arg0) {
          const it = arg0 as ConversationTreeItem;
          await conversationPanel.reveal(it.conv.id, it.conv.title);
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
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "colcoor.sendMessage",
      async (item?: ConversationTreeItem) => {
        let convId = item?.conv.id;
        let convTitle: string | null | undefined = item?.conv.title ?? null;
        if (!convId) {
          const row = await pickConversationInteractively();
          if (!row) {
            return;
          }
          convId = row.id;
          convTitle = row.title;
        }
        const text = await vscode.window.showInputBox({
          title: "Colcoor — message",
          prompt:
            "Your message (saved to the default branch, then Cursor agent per Settings → Colcoor → agent mode).",
          ignoreFocusOut: true,
        });
        if (!text?.trim()) {
          return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
        try {
          const result = await runColcoorUserTurn(
            api,
            agent,
            convId,
            convTitle,
            text.trim(),
            workspaceRoot,
          );
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
            const preview =
              body.length > 200 ? `${body.slice(0, 200)}…` : body;
            await vscode.window.showInformationMessage(
              `Colcoor: sent. Assistant: ${preview.replace(/\s+/g, " ")}`,
            );
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
        }
      },
    ),
  );
}

export function deactivate(): void {}
