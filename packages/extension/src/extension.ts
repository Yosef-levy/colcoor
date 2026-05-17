import * as vscode from "vscode";
import {
  ColcoorApiClient,
  type ConversationMember,
  type ConversationSummary,
  type NoteOut,
} from "./api/client";
import { getAccessTokenInteractive } from "./auth/extensionAccounts";
import type { ColcoorAuthProvider } from "./auth/extensionAccounts";
import { CursorSession } from "./auth/cursorSession";
import { refreshAgentModelCatalogWhenSignedIn } from "./agent/agentModelCatalogCache";
import { AgentRunner } from "./agent/agentRunner";
import { SECRET_CURSOR_AGENT_API_KEY } from "./agent/cursorAgentApiKey";
import {
  offerCursorAgentApiKeyAfterSignIn,
  promptStoreCursorAgentApiKey,
} from "./agent/cursorAgentApiKey";
import { scheduleCursorCliPresenceCheck, setupCursorCliInteractive } from "./agent/cursorCliSetup";
import { showAboutPanel } from "./conversation/aboutPanel";
import { getConversationDrawersPanelHtml } from "./conversation/drawersPanelHtml";
import {
  isSafeHttpUrlForWebview,
  listLegalPolicyLinksFromColcoorWorkspaceSection,
} from "./conversation/legalPolicySection";
import { buildConversationDrawersModel } from "./conversation/drawersModel";
import { sideChatOpenButtonCopy } from "./conversation/sideChatOpenButtonLabel";
import {
  formatColcoorDrawersChromeTitle,
  shouldCloseDrawersAfterConversationDelete,
} from "./conversation/drawersChromeTitle";
import { profilePatchFromInputs } from "./profile/profilePatchPlan";
import {
  createConversationPanelController,
  type RevealAtEventPrefetchOptions,
} from "./conversation/conversationPanel";
import {
  invalidateConversationListCache,
  listConversationsCached,
} from "./conversations/conversationsListCache";
import { syncConversationsWelcomeContextKeys } from "./conversations/conversationsWelcomeContext";
import { conversationIdAndTitleFromOpenSideChatArg } from "./sidechat/openSideChatCommandArg";
import {
  isPrivateBranchFromPrivacyPick,
  sendMessagePrivacyQuickPickItems,
} from "./conversation/sendMessagePalettePrivacy";
import { collectSendMessageBody } from "./conversation/sendMessageBodyCollection";
import type { SendMessageBodyMode } from "./conversation/sendMessageBodyCollection";
import { runColcoorUserTurn, type UserTurnResult } from "./conversation/runUserTurn";
import { ConversationsTreeProvider } from "./conversations/conversationsTreeProvider";
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
import {
  formatMemberLogLine,
  formatMemberQuickPickLabel,
} from "./conversations/conversationMemberDisplay";
import { runAddConversationMemberFlow } from "./conversations/conversationMemberInviteFlow";
import { collectMultilineTextInUntitledEditor } from "./conversations/firstMessageMultilineEditor";
import { normalizedOptionalFollowUpPrompt } from "./conversations/newConversationFirstMessage";
import { normalizedConversationTitle } from "./conversations/renameConversationTitle";
import { toggleSidebarVisibility } from "./conversations/toggleSidebarVisibility";
import { pinnedVerb, toggledPinnedState } from "./conversations/togglePinnedConversation";
import { openColcoorSettings } from "./util/openColcoorSettings";
import { showColcoorApiFailure } from "./util/showColcoorApiFailure";
import { filterTodoNotes } from "./notes/todoNotesFilter";
import { confirmDestructiveActionByTypingDelete } from "./conversation/destructiveDeleteConfirm";
import { shortStarredEventLabel, starredTreeEvents } from "./conversation/starredTreeEvents";

const SECRET_KEY_BACKEND_JWT = "colcoor.backendJwt";
const BACKEND_URL_ENV_VAR = "COLCOOR_API_URL";
const DEFAULT_BACKEND_BASE_URL = "https://api.colcoor.com";

/** Same conv payload shape as other conversation-scoped commands (sidebar tree item or `{ conv }`). */
type OpenSideChatCommandArg = ConversationCommandArg;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const activationLog = vscode.window.createOutputChannel("Colcoor Activation");
  context.subscriptions.push(activationLog);
  let activationStep = "activate:start";
  const markActivationStep = (step: string): void => {
    activationStep = step;
    activationLog.appendLine(`[${new Date().toISOString()}] ${step}`);
  };
  markActivationStep("activate:start");
  const activationWatchdog = setTimeout(() => {
    activationLog.appendLine(
      `[${new Date().toISOString()}] activation watchdog: still running at "${activationStep}"`,
    );
  }, 15000);
  context.subscriptions.push(
    new vscode.Disposable(() => {
      clearTimeout(activationWatchdog);
    }),
  );

  const config = vscode.workspace.getConfiguration("colcoor");
  markActivationStep("config:loaded");
  const configuredBaseUrl = config.get<string>("backendBaseUrl")?.trim();
  const envBaseUrl = process.env[BACKEND_URL_ENV_VAR]?.trim();
  const effectiveBaseUrl = (configuredBaseUrl || envBaseUrl || DEFAULT_BACKEND_BASE_URL).replace(
    /\/$/,
    "",
  );

  const session = new CursorSession(context.secrets, SECRET_KEY_BACKEND_JWT);
  const api = new ColcoorApiClient({
    baseUrl: effectiveBaseUrl,
    getAccessToken: () => session.getBackendAccessToken(),
  });
  const agent = new AgentRunner(context.secrets);
  markActivationStep("api-and-agent:ready");

  const conversationPanel = createConversationPanelController(context, {
    api,
    agent,
    getWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
  });
  context.subscriptions.push(new vscode.Disposable(() => conversationPanel.dispose()));
  markActivationStep("conversation-panel:ready");

  const colcoorLog = vscode.window.createOutputChannel("Colcoor");
  context.subscriptions.push(colcoorLog);

  const treeProvider = new ConversationsTreeProvider(api, async () =>
    Boolean(await session.getBackendAccessToken()),
  );
  const refreshTree = (): void => {
    invalidateConversationListCache();
    treeProvider.refresh();
  };

  async function refreshConversationsWelcomeContext(): Promise<void> {
    await syncConversationsWelcomeContextKeys(context.secrets, session);
    refreshAgentModelCatalogWhenSignedIn(
      context.secrets,
      Boolean(await session.getBackendAccessToken()),
    );
  }
  void refreshConversationsWelcomeContext();
  context.subscriptions.push(
    context.secrets.onDidChange((e) => {
      if (e.key === SECRET_CURSOR_AGENT_API_KEY) {
        void (async () => {
          await refreshConversationsWelcomeContext();
          refreshAgentModelCatalogWhenSignedIn(
            context.secrets,
            Boolean(await session.getBackendAccessToken()),
          );
        })();
      }
    }),
  );

  /**
   * After a user turn started outside the conversation webview (e.g. new conversation + first
   * message, or “Send message…”), sync the open panel so it does not stay on a pre-turn tree
   * snapshot from the webview `ready` handler.
   */
  async function notifyUserTurnOutcomeAndSyncConversationPanel(result: UserTurnResult): Promise<void> {
    await conversationPanel.refreshConversationTree({ quiet: true });
    await notifyUserTurnOutcome(result);
  }

  async function notifyUserTurnOutcome(result: UserTurnResult): Promise<void> {
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
      const preview = body.length > 200 ? `${body.slice(0, 200)}…` : body;
      await vscode.window.showInformationMessage(
        `Colcoor: sent. Assistant: ${preview.replace(/\s+/g, " ")}`,
      );
    }
  }

  const treeView = vscode.window.createTreeView("colcoor.conversations", {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);
  markActivationStep("tree-view:ready");
  let drawersPanel: vscode.WebviewPanel | undefined;
  let drawersConversationId: string | undefined;
  let drawersConversationTitle: string | null = null;
  /** Active Starred vs TODO tab in the drawers webview; kept for server reloads ([ui-features.md] §11). */
  let drawersPreferredTab: "starred" | "todo" = "starred";

  async function refreshDrawersPanelHtmlFromServer(): Promise<void> {
    if (!drawersPanel || !drawersConversationId) {
      return;
    }
    const [{ events }, notes, rows] = await Promise.all([
      api.getTree(drawersConversationId),
      api.listNotes(drawersConversationId),
      listConversationsCached(api).catch((): ConversationSummary[] => []),
    ]);
    const model = buildConversationDrawersModel(events, notes);
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
  markActivationStep("commands:registered");

  async function pickConversationInteractively(): Promise<
    { id: string; title: string | null; pinned: boolean } | undefined
  > {
    try {
      const rows = await listConversationsCached(api);
      if (rows.length === 0) {
        await vscode.window.showWarningMessage("Colcoor: no conversations — create one first.");
        return undefined;
      }
      const picked = await vscode.window.showQuickPick<
        vscode.QuickPickItem & { cid: string; ctitle: string | null; cpinned: boolean }
      >(
        rows.map((r) => ({
          label: r.title?.trim() ? r.title : "(untitled)",
          description: r.id,
          cid: r.id,
          ctitle: r.title,
          cpinned: Boolean(r.pinned),
        })),
        { title: "Colcoor — pick conversation", placeHolder: "Choose a conversation" },
      );
      if (!picked) {
        return undefined;
      }
      return {
        id: picked.cid,
        title: normalizedConversationTitle(picked.ctitle ?? ""),
        pinned: picked.cpinned,
      };
    } catch (e) {
      await showColcoorApiFailure(e);
      return undefined;
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("colcoor.setupCursorCli", async () => {
      await setupCursorCliInteractive();
      await refreshConversationsWelcomeContext();
    }),
    vscode.commands.registerCommand("colcoor.setCursorAgentApiKey", async () => {
      await promptStoreCursorAgentApiKey(context.secrets);
      await refreshConversationsWelcomeContext();
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
        await offerCursorAgentApiKeyAfterSignIn(context.secrets);
        await refreshConversationsWelcomeContext();
        refreshTree();
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
    vscode.commands.registerCommand(
      "colcoor.signOut",
      async (opts?: { silent?: boolean }) => {
        await session.clearBackendAccessToken();
        await refreshConversationsWelcomeContext();
        refreshTree();
        if (!opts?.silent) {
          await vscode.window.showInformationMessage("Colcoor: signed out.");
        }
      },
    ),
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
      if (!(await session.getBackendAccessToken())) {
        await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
        return;
      }
      if (!drawersPanel || !drawersConversationId) {
        await vscode.window.showWarningMessage(
          "Colcoor: open conversation drawers first (Colcoor: Open conversation drawers…).",
        );
        return;
      }
      try {
        await refreshDrawersPanelHtmlFromServer();
        void vscode.window.setStatusBarMessage("Colcoor: drawers lists refreshed.", 2500);
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
    vscode.commands.registerCommand("colcoor.openSettings", async () => {
      await openColcoorSettings((cmd, query) => vscode.commands.executeCommand(cmd, query));
    }),
    vscode.commands.registerCommand("colcoor.showColcoorMenu", async () => {
      type HubPick = vscode.QuickPickItem & { commandId: string };
      const items: HubPick[] = [
        {
          label: "Extension settings…",
          description: "VS Code Settings → Colcoor",
          commandId: "colcoor.openSettings",
        },
        {
          label: "Legal policy URLs (Terms, Privacy, Refund)…",
          commandId: "colcoor.openLegalPolicySettings",
        },
        {
          label: "Side chat sounds & notifications…",
          commandId: "colcoor.openSideChatSoundSettings",
        },
        {
          label: "Test side chat sound…",
          description: "Preview message vs mention tone in the open conversation tab",
          commandId: "colcoor.testSideChatSound",
        },
        { label: "Profile…", commandId: "colcoor.editProfile" },
        { label: "Cursor CLI (agent) setup…", commandId: "colcoor.setupCursorCli" },
        { label: "Cursor API key for agent…", commandId: "colcoor.setCursorAgentApiKey" },
        {
          label: "Help…",
          description: "About, version, and product info",
          commandId: "colcoor.openAbout",
        },
      ];
      const picked = await vscode.window.showQuickPick(items, {
        title: "Colcoor — settings & tools",
        matchOnDescription: true,
      });
      if (picked && "commandId" in picked && typeof (picked as HubPick).commandId === "string") {
        await vscode.commands.executeCommand((picked as HubPick).commandId);
      }
    }),
    vscode.commands.registerCommand("colcoor.openLegalPolicySettings", async () => {
      await openColcoorSettings((cmd, query) => vscode.commands.executeCommand(cmd, query), {
        searchSuffix: "legal",
      });
    }),
    vscode.commands.registerCommand("colcoor.openSideChatSoundSettings", async () => {
      await openColcoorSettings((cmd, query) => vscode.commands.executeCommand(cmd, query), {
        searchSuffix: "side chat",
      });
    }),
    vscode.commands.registerCommand("colcoor.testSideChatSound", async () => {
      type SideChatSoundPick = vscode.QuickPickItem & { soundKind: "message" | "mention" };
      const pick = await vscode.window.showQuickPick<SideChatSoundPick>(
        [
          { label: "Message sound", soundKind: "message" },
          { label: "Mention sound", soundKind: "mention" },
        ],
        {
          title: "Colcoor — test side-chat sound",
          placeHolder: "Choose which sound to preview",
          ignoreFocusOut: true,
        },
      );
      if (!pick) {
        return;
      }
      const ok = await conversationPanel.previewSideChatSound(pick.soundKind);
      if (!ok) {
        await vscode.window.showInformationMessage(
          "Colcoor: open a conversation tab and click once inside it to enable side-chat sounds, then test again.",
        );
      }
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
          if (drawersPanel && shouldCloseDrawersAfterConversationDelete(drawersConversationId, id)) {
            drawersPanel.dispose();
          }
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
          if (drawersPanel && drawersConversationId === convId) {
            drawersConversationTitle = out.title ?? null;
            drawersPanel.title = formatColcoorDrawersChromeTitle(out.title);
          }
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
        await conversationPanel.reveal(convId, convTitle ?? null);
        await conversationPanel.openInlineSideChat();
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
          prompt: "https:// or http:// image URL. Leave empty and press Enter to clear. Esc keeps the current URL.",
          value: me.avatar_url ?? "",
          ignoreFocusOut: true,
        });
        const planned = profilePatchFromInputs(dn, av);
        if (!planned.ok) {
          if (planned.reason === "invalid_avatar_url") {
            await vscode.window.showWarningMessage(`Colcoor: ${planned.message}`);
          }
          return;
        }
        const updated = await api.patchMe(planned.patch);
        await vscode.window.showInformationMessage(`Colcoor: profile saved (${updated.email}).`);
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
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
          const [{ events }, notes] = await Promise.all([api.getTree(convId), api.listNotes(convId)]);
          const visibleEventIds = new Set(events.map((e) => e.id));
          const todos = filterTodoNotes(notes).filter((n) => visibleEventIds.has(n.event_id));
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
          const prefetch: RevealAtEventPrefetchOptions = {
            prefetchedTreeEvents: events,
            prefetchedNotes: notes,
          };
          await conversationPanel.revealAtEvent(convId, convTitle ?? null, picked.eventId, prefetch);
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
          await conversationPanel.revealAtEvent(convId, convTitle ?? null, picked.eventId, {
            prefetchedTreeEvents: events,
          });
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
          const [{ events }, notes, rows] = await Promise.all([
            api.getTree(convId),
            api.listNotes(convId),
            listConversationsCached(api).catch((): ConversationSummary[] => []),
          ]);
          const model = buildConversationDrawersModel(events, notes);
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
              if (msg.type === "drawersPreferredTab" && (msg.tab === "starred" || msg.tab === "todo")) {
                drawersPreferredTab = msg.tab;
                return;
              }
              if (msg.type === "reloadDrawersLists") {
                if (!drawersConversationId) {
                  return;
                }
                try {
                  await refreshDrawersPanelHtmlFromServer();
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
                  await refreshDrawersPanelHtmlFromServer();
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
        await conversationPanel.reveal(ctx.conversationId, ctx.title ?? null);
        conversationPanel.queueSideChatGraphReferenceForNextSend(ctx.selectedEventId, null);
        await conversationPanel.openInlineSideChat();
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
        let notesForPick: NoteOut[];
        if (ctx.cachedNotesForConversation !== undefined) {
          notesForPick = [...ctx.cachedNotesForConversation];
        } else {
          notesForPick = await api.listNotes(ctx.conversationId);
        }
        const forSelected = notesForPick.filter((n) => n.event_id === ctx.selectedEventId);
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
        const noteId =
          typeof (pick as { nid?: string }).nid === "string" && (pick as { nid: string }).nid.trim()
            ? (pick as { nid: string }).nid.trim()
            : typeof pick.description === "string"
              ? pick.description.trim()
              : "";
        await conversationPanel.revealAtEvent(ctx.conversationId, ctx.title ?? null, ctx.selectedEventId, {
          prefetchedNotes: notesForPick,
        });
        conversationPanel.queueSideChatGraphReferenceForNextSend(ctx.selectedEventId, noteId || null);
        await conversationPanel.openInlineSideChat();
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
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
  );

  context.subscriptions.push(
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
  );
  markActivationStep("activate:complete");
  clearTimeout(activationWatchdog);
}

export function deactivate(): void {}
