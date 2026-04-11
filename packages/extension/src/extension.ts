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
  const api = new ColcoorApiClient({
    baseUrl,
    getAccessToken: () => session.getBackendAccessToken(),
  });
  const agent = new AgentRunner();

  context.subscriptions.push(
    vscode.commands.registerCommand("colcoor.signInDev", async () => {
      const cursorSub = await vscode.window.showInputBox({
        title: "Colcoor dev sign-in",
        prompt: "Cursor subject / stable id (cursor_sub)",
        ignoreFocusOut: true,
      });
      if (!cursorSub?.trim()) {
        return;
      }
      const email = await vscode.window.showInputBox({
        title: "Colcoor dev sign-in",
        prompt: "Email",
        ignoreFocusOut: true,
      });
      if (!email?.trim()) {
        return;
      }
      const displayName =
        (await vscode.window.showInputBox({
          title: "Colcoor dev sign-in",
          prompt: "Display name (optional)",
          ignoreFocusOut: true,
        })) ?? "";
      try {
        const { access_token: accessToken } = await api.devLogin({
          cursor_sub: cursorSub.trim(),
          email: email.trim(),
          display_name: displayName.trim(),
        });
        await session.setBackendAccessToken(accessToken);
        await vscode.window.showInformationMessage("Colcoor: signed in (dev).");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
      }
    }),
    vscode.commands.registerCommand("colcoor.signOut", async () => {
      await session.clearBackendAccessToken();
      await vscode.window.showInformationMessage("Colcoor: signed out.");
    }),
    vscode.commands.registerCommand("colcoor.refreshConversations", async () => {
      try {
        const rows = await api.listConversations();
        if (rows.length === 0) {
          await vscode.window.showInformationMessage("Colcoor: no conversations yet.");
          return;
        }
        const lines = rows.map((r) => `${r.title ?? "(untitled)"} — ${r.id}`);
        await vscode.window.showQuickPick(lines, {
          title: "Colcoor conversations",
          canPickMany: false,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
      }
    }),
    vscode.commands.registerCommand("colcoor.openAbout", async () => {
      await vscode.window.showInformationMessage(
        "Colcoor: branching conversations with you in control of where the dialogue continues. " +
          "Details stay in product docs — not raw transcripts or agent plumbing.",
      );
    }),
  );

  void agent;
}

export function deactivate(): void {}
