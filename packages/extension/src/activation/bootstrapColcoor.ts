import * as vscode from "vscode";
import { ColcoorApiClient } from "../api/client";
import { LocalConversationStore } from "../local/localConversationStore";
import { CursorSession } from "../auth/cursorSession";
import { refreshAgentModelCatalogWhenSignedIn } from "../agent/agentModelCatalogCache";
import { AgentRunner } from "../agent/agentRunner";
import { SECRET_CURSOR_AGENT_API_KEY } from "../agent/cursorAgentApiKey";
import { createConversationPanelController } from "../conversation/conversationPanel";
import { createDrawersPanelController } from "../conversation/drawersPanelController";
import { notifyUserTurnOutcomeAndSyncConversationPanel } from "../conversation/userTurnOutcomeNotify";
import { invalidateConversationListCache } from "../conversations/conversationsListCache";
import { syncConversationsWelcomeContextKeys } from "../conversations/conversationsWelcomeContext";
import { pickConversationInteractively as pickConversationInteractivelyImpl } from "../conversations/pickConversationInteractively";
import { ConversationsTreeProvider } from "../conversations/conversationsTreeProvider";
import {
  CONVERSATION_AUTO_REFRESH_MS,
  shouldAutoRefreshConversations,
} from "../conversations/conversationAutoRefreshPolicy";
import {
  BACKEND_URL_ENV_VAR,
  DEFAULT_BACKEND_BASE_URL,
  SECRET_KEY_BACKEND_JWT,
  type ColcoorExtensionDeps,
} from "./colcoorExtensionDeps";

export type BootstrapColcoorResult = {
  deps: ColcoorExtensionDeps;
  markActivationStep: (step: string) => void;
  completeActivation: () => void;
};

export async function bootstrapColcoor(context: vscode.ExtensionContext): Promise<BootstrapColcoorResult> {
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

  const localMode = config.get<string>("storageMode") === "local";
  const activationWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  if (localMode && !activationWorkspaceRoot) {
    void vscode.window.showErrorMessage(
      "Colcoor offline (local) mode needs an open workspace folder. Open a folder and reload the window.",
    );
  }
  void vscode.commands.executeCommand("setContext", "colcoor.localMode", localMode);

  const api = localMode
    ? new LocalConversationStore(activationWorkspaceRoot)
    : new ColcoorApiClient({
        baseUrl: effectiveBaseUrl,
        getAccessToken: () => session.getBackendAccessToken(),
      });
  const isReady = async (): Promise<boolean> =>
    localMode || Boolean(await session.getBackendAccessToken());
  const notifyCollaborationDisabledInLocalMode = async (feature: string): Promise<void> => {
    await vscode.window.showInformationMessage(
      `Colcoor is in offline (local) mode — ${feature} is not available. It needs the Colcoor backend and collaborators.`,
    );
  };
  const agent = new AgentRunner(context.secrets);
  markActivationStep("api-and-agent:ready");

  const conversationPanel = createConversationPanelController(context, {
    api,
    agent,
    getWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
    localMode,
  });
  context.subscriptions.push(new vscode.Disposable(() => conversationPanel.dispose()));
  markActivationStep("conversation-panel:ready");

  const colcoorLog = vscode.window.createOutputChannel("Colcoor");
  context.subscriptions.push(colcoorLog);

  const treeProvider = new ConversationsTreeProvider(api, isReady);
  const refreshTree = (): void => {
    invalidateConversationListCache();
    treeProvider.refresh();
  };

  async function refreshConversationsWelcomeContext(): Promise<void> {
    await syncConversationsWelcomeContextKeys(context.secrets, session, { localMode });
    refreshAgentModelCatalogWhenSignedIn(context.secrets, await isReady());
  }
  void refreshConversationsWelcomeContext();
  context.subscriptions.push(
    context.secrets.onDidChange((e) => {
      if (e.key === SECRET_CURSOR_AGENT_API_KEY) {
        void (async () => {
          await refreshConversationsWelcomeContext();
          refreshAgentModelCatalogWhenSignedIn(context.secrets, await isReady());
        })();
      }
    }),
  );

  const pickConversationInteractively = (): ReturnType<typeof pickConversationInteractivelyImpl> =>
    pickConversationInteractivelyImpl(api);

  const notifyUserTurnOutcomeAndSyncConversationPanelBound = (
    result: Parameters<typeof notifyUserTurnOutcomeAndSyncConversationPanel>[0],
  ): Promise<void> =>
    notifyUserTurnOutcomeAndSyncConversationPanel(result, conversationPanel, refreshTree);

  const drawers = createDrawersPanelController(context, {
    api,
    conversationPanel,
    isReady,
    pickConversationInteractively,
  });

  const treeView = vscode.window.createTreeView("colcoor.conversations", {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);
  markActivationStep("tree-view:ready");

  const autoRefreshTimer = setInterval(async () => {
    const hasBackendToken = await isReady();
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

  const deps: ColcoorExtensionDeps = {
    context,
    api,
    agent,
    session,
    localMode,
    conversationPanel,
    colcoorLog,
    refreshTree,
    isReady,
    notifyCollaborationDisabledInLocalMode,
    notifyUserTurnOutcomeAndSyncConversationPanel: notifyUserTurnOutcomeAndSyncConversationPanelBound,
    pickConversationInteractively,
    refreshConversationsWelcomeContext,
    drawers,
  };

  return {
    deps,
    markActivationStep,
    completeActivation: (): void => {
      markActivationStep("activate:complete");
      clearTimeout(activationWatchdog);
    },
  };
}
