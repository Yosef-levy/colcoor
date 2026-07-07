import * as vscode from "vscode";
import { showAboutPanel } from "../conversation/aboutPanel";
import { profilePatchFromInputs } from "../profile/profilePatchPlan";
import { toggleSidebarVisibility } from "../conversations/toggleSidebarVisibility";
import { openColcoorSettings } from "../util/openColcoorSettings";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";

export function registerSettingsCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const { api, conversationPanel, isReady } = deps;
  return [
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
    vscode.commands.registerCommand("colcoor.openAbout", () => {
      showAboutPanel();
    }),
    vscode.commands.registerCommand("colcoor.editProfile", async () => {
      if (!(await isReady())) {
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
  ];
}
