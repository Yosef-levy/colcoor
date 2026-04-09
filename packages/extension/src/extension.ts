import * as vscode from "vscode";
import { ColcoorApiClient } from "./api/client";
import { CursorSession } from "./auth/cursorSession";
import { AgentRunner } from "./agent/agentRunner";

const SECRET_KEY_BACKEND_JWT = "colcoor.backendJwt";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("colcoor");
  const baseUrl = (config.get<string>("backendBaseUrl") ?? "http://127.0.0.1:8000").replace(
    /\/$/,
    "",
  );

  const session = new CursorSession(context.secrets, SECRET_KEY_BACKEND_JWT);
  const api = new ColcoorApiClient({ baseUrl, getAccessToken: () => session.getBackendAccessToken() });
  const agent = new AgentRunner();

  context.subscriptions.push(
    vscode.commands.registerCommand("colcoor.refreshConversations", async () => {
      void api;
      await vscode.window.showInformationMessage(
        "Colcoor: conversation list refresh will call GET /conversations when implemented.",
      );
    }),
    vscode.commands.registerCommand("colcoor.openAbout", async () => {
      await vscode.window.showInformationMessage(
        "Colcoor: branching conversations with you in control of where the dialogue continues. " +
          "Details stay in product docs — not raw transcripts or agent plumbing.",
      );
    }),
  );

  void agent;
  void session;
}

export function deactivate(): void {}
