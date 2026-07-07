import * as vscode from "vscode";
import type { ColcoorClient } from "../api/client";
import type { AgentRunner } from "../agent/agentRunner";
import type { CursorSession } from "../auth/cursorSession";
import type { createConversationPanelController } from "../conversation/conversationPanel";
import type { DrawersPanelController } from "../conversation/drawersPanelController";
import type { UserTurnResult } from "../conversation/runUserTurn";

export const SECRET_KEY_BACKEND_JWT = "colcoor.backendJwt";
export const BACKEND_URL_ENV_VAR = "COLCOOR_API_URL";
export const DEFAULT_BACKEND_BASE_URL = "https://api.colcoor.com";

export type ConversationPanelController = ReturnType<typeof createConversationPanelController>;

export type PickedConversation = {
  id: string;
  title: string | null;
  pinned: boolean;
};

export type ColcoorExtensionDeps = {
  context: vscode.ExtensionContext;
  api: ColcoorClient;
  agent: AgentRunner;
  session: CursorSession;
  localMode: boolean;
  conversationPanel: ConversationPanelController;
  colcoorLog: vscode.OutputChannel;
  refreshTree: () => void;
  isReady: () => Promise<boolean>;
  notifyCollaborationDisabledInLocalMode: (feature: string) => Promise<void>;
  notifyUserTurnOutcomeAndSyncConversationPanel: (result: UserTurnResult) => Promise<void>;
  pickConversationInteractively: () => Promise<PickedConversation | undefined>;
  refreshConversationsWelcomeContext: () => Promise<void>;
  drawers: DrawersPanelController;
};
