import * as vscode from "vscode";
import { getAccessTokenInteractive } from "../auth/extensionAccounts";
import type { ColcoorAuthProvider } from "../auth/extensionAccounts";
import { offerCursorAgentApiKeyAfterSignIn } from "../agent/cursorAgentApiKey";
import { markHasSignedIn, maybeOfferFirstSignInHint } from "../onboarding/gettingStarted";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";

export function registerAuthCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const {
    context,
    api,
    session,
    localMode,
    refreshTree,
    refreshConversationsWelcomeContext,
  } = deps;
  return [
    vscode.commands.registerCommand("colcoor.signIn", async () => {
      if (localMode) {
        await vscode.window.showInformationMessage(
          "Colcoor is in offline (local) mode — sign-in is not needed. Conversations are stored in this workspace's .colcoor folder.",
        );
        return;
      }
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
      ];
      const pick = await vscode.window.showQuickPick(items, {
        title: "Colcoor — sign in",
        placeHolder: "Choose the same account type you use in Cursor",
      });
      if (!pick) {
        return;
      }
      let accessToken: string | undefined;
      try {
        accessToken = await getAccessTokenInteractive(pick.provider);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Colcoor: sign-in failed. ${detail}`);
        return;
      }
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
        const firstSignIn = await markHasSignedIn(context.globalState);
        await offerCursorAgentApiKeyAfterSignIn(context.secrets);
        await refreshConversationsWelcomeContext();
        refreshTree();
        void maybeOfferFirstSignInHint(firstSignIn);
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
  ];
}
