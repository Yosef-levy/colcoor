import * as vscode from "vscode";
import { ColcoorApiClient, type ConversationMember } from "./api/client";
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
import { getConversationDrawersPanelHtml } from "./conversation/drawersPanelHtml";
import { buildConversationDrawersModel } from "./conversation/drawersModel";
import { profilePatchFromInputs } from "./profile/profilePatchPlan";
import { createConversationPanelController } from "./conversation/conversationPanel";
import { conversationIdAndTitleFromOpenSideChatArg } from "./sidechat/openSideChatCommandArg";
import { openSideChatPanel } from "./sidechat/sideChatPanel";
import { runColcoorUserTurn } from "./conversation/runUserTurn";
import {
  ConversationTreeItem,
  ConversationsTreeProvider,
} from "./conversations/conversationsTreeProvider";
import {
  CONVERSATION_AUTO_REFRESH_MS,
  shouldAutoRefreshConversations,
} from "./conversations/conversationAutoRefreshPolicy";
import {
  type ConversationCommandArg,
  conversationDisplayTitleFromCommandArg,
  conversationIdFromCommandArg,
  conversationPinnedFromCommandArg,
  conversationTitleFromCommandArg,
  NO_CONVERSATION_FOR_COMMAND_MESSAGE,
} from "./conversations/conversationCommandArg";
import { validateColcoorInviteUserIdInput } from "./conversations/conversationMemberInvite";
import { normalizedConversationTitle } from "./conversations/renameConversationTitle";
import { toggleSidebarVisibility } from "./conversations/toggleSidebarVisibility";
import { pinnedVerb, toggledPinnedState } from "./conversations/togglePinnedConversation";
import { openColcoorSettings } from "./util/openColcoorSettings";
import { showColcoorApiFailure } from "./util/showColcoorApiFailure";
import { filterTodoNotes } from "./notes/todoNotesFilter";
import { shortStarredEventLabel, starredTreeEvents } from "./conversation/starredTreeEvents";

function formatMemberQuickPickLabel(m: ConversationMember): string {
  const name = m.display_name?.trim() ? m.display_name : "—";
  const em = m.email?.trim() ? m.email : "—";
  return `${m.role} — ${name} <${em}>`;
}

const SECRET_KEY_BACKEND_JWT = "colcoor.backendJwt";

type OpenSideChatCommandArg = ConversationTreeItem | { conv: { id: string; title?: string | null } };

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
  let drawersPanel: vscode.WebviewPanel | undefined;
  let drawersConversationId: string | undefined;
  let drawersConversationTitle: string | null = null;
  const autoRefreshTimer = setInterval(async () => {
    const hasBackendToken = Boolean(await session.getBackendAccessToken());
    if (
      shouldAutoRefreshConversations({
        hasBackendToken,
        treeVisible: treeView.visible,
      })
    ) {
      refreshTree();
    }
  }, CONVERSATION_AUTO_REFRESH_MS);
  context.subscriptions.push(
    new vscode.Disposable(() => {
      clearInterval(autoRefreshTimer);
    }),
  );

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
      await showColcoorApiFailure(e);
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
        await showColcoorApiFailure(e);
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
        await showColcoorApiFailure(e);
      }
    }),
    vscode.commands.registerCommand("colcoor.refreshConversations", () => {
      refreshTree();
    }),
    vscode.commands.registerCommand("colcoor.openSettings", async () => {
      await openColcoorSettings((cmd, query) => vscode.commands.executeCommand(cmd, query));
    }),
    vscode.commands.registerCommand("colcoor.toggleConversationsSidebar", async () => {
      await toggleSidebarVisibility((cmd) => vscode.commands.executeCommand(cmd));
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
      "colcoor.listConversationMembers",
      async (item?: ConversationCommandArg) => {
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
              const name = m.display_name?.trim() ? m.display_name : "—";
              const em = m.email?.trim() ? m.email : "—";
              colcoorLog.appendLine(`  ${m.role.padEnd(8)} ${name}  <${em}>  ${m.user_id}`);
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
        const id = conversationIdFromCommandArg(item);
        if (!id) {
          await vscode.window.showWarningMessage(NO_CONVERSATION_FOR_COMMAND_MESSAGE);
          return;
        }
        const rawUserId = await vscode.window.showInputBox({
          title: "Colcoor — add member",
          prompt:
            "Existing Colcoor user UUID to invite (they must have signed in once). Role: pick next.",
          ignoreFocusOut: true,
          validateInput: (v) => validateColcoorInviteUserIdInput(v),
        });
        if (rawUserId === undefined) {
          return;
        }
        const userId = rawUserId.trim();
        const rolePick = await vscode.window.showQuickPick(
          [
            { label: "Editor", role: "editor" as const },
            { label: "Viewer", role: "viewer" as const },
          ],
          { title: "Colcoor — member role", placeHolder: "Editor can post; viewer is read-only" },
        );
        if (!rolePick) {
          return;
        }
        try {
          await api.postConversationMember(id, { user_id: userId, role: rolePick.role });
          refreshTree();
          await vscode.window.showInformationMessage(
            `Colcoor: added member (${rolePick.role}). They will see this conversation after refresh.`,
          );
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.changeMemberRole",
      async (item?: ConversationCommandArg) => {
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
    vscode.commands.registerCommand(
      "colcoor.deleteConversation",
      async (item?: ConversationCommandArg) => {
        const id = conversationIdFromCommandArg(item);
        const title = conversationTitleFromCommandArg(item);
        if (!id) {
          await vscode.window.showWarningMessage(NO_CONVERSATION_FOR_COMMAND_MESSAGE);
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
          try {
            const rows = await api.listConversations();
            currentPinned = rows.find((r) => r.id === convId)?.pinned;
          } catch {
            currentPinned = false;
          }
        } else if (currentPinned === undefined) {
          try {
            const rows = await api.listConversations();
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
    vscode.commands.registerCommand("colcoor.openAbout", () => {
      showAboutPanel();
    }),
    vscode.commands.registerCommand(
      "colcoor.openSideChat",
      async (item?: OpenSideChatCommandArg) => {
      if (!(await session.getBackendAccessToken())) {
        await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
        return;
      }
      const picked = conversationIdAndTitleFromOpenSideChatArg(item);
      let convId = picked.convId;
      let convTitle: string | null | undefined = picked.convTitle;
      if (!convId) {
        const row = await pickConversationInteractively();
        if (!row) {
          return;
        }
        convId = row.id;
        convTitle = row.title;
      }
      try {
        await openSideChatPanel(context, api, convId, convTitle ?? null);
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
    vscode.commands.registerCommand("colcoor.editProfile", async () => {
      if (!(await session.getBackendAccessToken())) {
        await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
        return;
      }
      try {
        const me = await api.getMe();
        const dn = await vscode.window.showInputBox({
          title: "Colcoor profile — display name",
          prompt: "Shown in members list and future side chat.",
          value: me.display_name,
          ignoreFocusOut: true,
        });
        const av = await vscode.window.showInputBox({
          title: "Colcoor profile — avatar URL",
          prompt: "https… Leave empty and press Enter to clear. Esc to keep the current URL.",
          value: me.avatar_url ?? "",
          ignoreFocusOut: true,
        });
        const patch = profilePatchFromInputs(dn, av);
        if (!patch) {
          return;
        }
        const updated = await api.patchMe(patch);
        await vscode.window.showInformationMessage(`Colcoor: profile saved (${updated.email}).`);
      } catch (e) {
        await showColcoorApiFailure(e);
      }
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
      "colcoor.listTodoNotesInConversation",
      async (item?: ConversationCommandArg) => {
        if (!(await session.getBackendAccessToken())) {
          await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
          return;
        }
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
        try {
          const notes = await api.listNotes(convId);
          const todos = filterTodoNotes(notes);
          if (todos.length === 0) {
            await vscode.window.showInformationMessage(
              "Colcoor: no TODO notes in this conversation (first line must start with “TODO”).",
            );
            return;
          }
          type TodoPick = vscode.QuickPickItem & { eventId: string };
          const picked = await vscode.window.showQuickPick<TodoPick>(
            todos.map((n) => {
              const head = n.content.replace(/\r\n/g, "\n").split("\n")[0]?.trim() || "(TODO note)";
              const label = head.length > 72 ? `${head.slice(0, 72)}…` : head;
              return {
                label,
                description: n.event_id,
                detail: n.id,
                eventId: n.event_id,
              };
            }),
            {
              title: "Colcoor — TODO notes",
              placeHolder: "Pick a note to open its host message in the conversation panel",
            },
          );
          if (!picked) {
            return;
          }
          await conversationPanel.revealAtEvent(convId, convTitle ?? null, picked.eventId);
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.listStarredMessagesInConversation",
      async (item?: ConversationCommandArg) => {
        if (!(await session.getBackendAccessToken())) {
          await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
          return;
        }
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
        try {
          const { events } = await api.getTree(convId);
          const starred = [...starredTreeEvents(events)].sort(
            (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
          );
          if (starred.length === 0) {
            await vscode.window.showInformationMessage(
              "Colcoor: no starred messages in this conversation.",
            );
            return;
          }
          type StarPick = vscode.QuickPickItem & { eventId: string };
          const picked = await vscode.window.showQuickPick<StarPick>(
            starred.map((e) => {
              const lab = shortStarredEventLabel(e);
              const label = lab.length > 80 ? `${lab.slice(0, 80)}…` : lab;
              return {
                label,
                description: e.id,
                detail: e.kind,
                eventId: e.id,
              };
            }),
            {
              title: "Colcoor — starred messages",
              placeHolder: "Pick a message to open it in the conversation panel",
            },
          );
          if (!picked) {
            return;
          }
          await conversationPanel.revealAtEvent(convId, convTitle ?? null, picked.eventId);
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.openConversationDrawers",
      async (arg?: ConversationCommandArg) => {
        if (!(await session.getBackendAccessToken())) {
          await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
          return;
        }
        let convId = conversationIdFromCommandArg(arg);
        let convTitle: string | null | undefined = conversationDisplayTitleFromCommandArg(arg);
        const preferredTab =
          arg && typeof arg === "object" && "preferredTab" in arg && arg.preferredTab === "todo"
            ? "todo"
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
          const [{ events }, notes] = await Promise.all([api.getTree(convId), api.listNotes(convId)]);
          const model = buildConversationDrawersModel(events, notes);
          drawersConversationId = convId;
          drawersConversationTitle = convTitle ?? null;
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
            });
            drawersPanel.webview.onDidReceiveMessage(async (m: unknown) => {
              const msg = m as { type?: string; eventId?: string };
              if (!msg || typeof msg.type !== "string") {
                return;
              }
              if (msg.type === "openProfile") {
                await vscode.commands.executeCommand("colcoor.editProfile");
                return;
              }
              if (msg.type === "openSettings") {
                await vscode.commands.executeCommand("colcoor.openSettings");
                return;
              }
              if (msg.type === "openAbout") {
                await vscode.commands.executeCommand("colcoor.openAbout");
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
                return;
              }
              if (msg.type === "setupCursorCli") {
                await vscode.commands.executeCommand("colcoor.setupCursorCli");
                return;
              }
              if (msg.type === "setCursorAgentApiKey") {
                await vscode.commands.executeCommand("colcoor.setCursorAgentApiKey");
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
          drawersPanel.title = `Colcoor — Drawers · ${convTitle?.trim() ? convTitle : "(untitled)"}`;
          drawersPanel.webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri] };
          drawersPanel.webview.html = getConversationDrawersPanelHtml(
            drawersPanel.webview.cspSource,
            String(Date.now()),
            model,
            preferredTab,
          );
          drawersPanel.reveal(vscode.ViewColumn.Beside, false);
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand("colcoor.referenceSelectedMessageInSideChat", async () => {
      const ctx = conversationPanel.getSelectedMessageContext();
      if (!ctx) {
        await vscode.window.showWarningMessage(
          "Colcoor: open a conversation and select a message first.",
        );
        return;
      }
      try {
        await openSideChatPanel(context, api, ctx.conversationId, ctx.title ?? null, {
          referencedEventId: ctx.selectedEventId,
        });
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
    vscode.commands.registerCommand("colcoor.referenceSelectedNoteInSideChat", async () => {
      const ctx = conversationPanel.getSelectedMessageContext();
      if (!ctx) {
        await vscode.window.showWarningMessage(
          "Colcoor: open a conversation and select a message first.",
        );
        return;
      }
      try {
        const notes = await api.listNotes(ctx.conversationId);
        const forSelected = notes.filter((n) => n.event_id === ctx.selectedEventId);
        if (forSelected.length === 0) {
          await vscode.window.showWarningMessage(
            "Colcoor: selected message has no notes to reference.",
          );
          return;
        }
        const pick = await vscode.window.showQuickPick(
          forSelected.map((n) => ({
            label: n.content.split("\n")[0]?.trim() || "(empty note)",
            description: n.id,
            nid: n.id,
          })),
          { title: "Colcoor — reference note in side chat", placeHolder: "Choose a note" },
        );
        if (!pick) {
          return;
        }
        await openSideChatPanel(context, api, ctx.conversationId, ctx.title ?? null, {
          referencedEventId: ctx.selectedEventId,
          referencedNoteId: pick.nid,
        });
      } catch (e) {
        await showColcoorApiFailure(e);
      }
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
          await showColcoorApiFailure(e);
        }
      },
    ),
  );
}

export function deactivate(): void {}
