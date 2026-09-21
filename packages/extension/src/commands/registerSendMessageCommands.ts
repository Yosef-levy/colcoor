import * as vscode from "vscode";
import { resolveProviderId } from "../agent/providerApiKey";
import {
  isPrivateBranchFromPrivacyPick,
  sendMessagePrivacyQuickPickItems,
} from "../conversation/sendMessagePalettePrivacy";
import { collectSendMessageBody } from "../conversation/sendMessageBodyCollection";
import type { SendMessageBodyMode } from "../conversation/sendMessageBodyCollection";
import { runColcoorUserTurn } from "../conversation/runUserTurn";
import {
  type ConversationCommandArg,
  conversationDisplayTitleFromCommandArg,
  conversationIdFromCommandArg,
} from "../conversations/conversationCommandArg";
import { collectMultilineTextInUntitledEditor } from "../conversations/firstMessageMultilineEditor";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";
import {
  dispatchSlashCommand,
  resolveProviderCommandCatalog,
  resolveProviderSlashCapabilities,
} from "./slash";
import { CURSOR_CLI_MODE_ASK } from "../agent/cursorCliMode";
import {
  controlledSeedUnavailableReason,
  parseControlledSeed,
  readControlledSeedByConversationMap,
  readControlledSeedForConversation,
} from "../conversation/conversationControlledSeed";

export function registerSendMessageCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const {
    api,
    agent,
    context,
    conversationPanel,
    pickConversationInteractively,
    notifyUserTurnOutcomeAndSyncConversationPanel,
  } = deps;
  return [
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
        const controlled = readControlledSeedForConversation(
          readControlledSeedByConversationMap(context.workspaceState),
          convId,
        );
        const generationForMode = (
          mode: "ask" | "plan" | "agent",
        ): { generationSeed?: number; generationTemperature?: number } | undefined => {
          if (!controlled.enabled) return {};
          const unavailable = controlledSeedUnavailableReason(resolveProviderId(), mode);
          if (unavailable) {
            void vscode.window.showWarningMessage(`Colcoor: ${unavailable}`);
            return undefined;
          }
          try {
            const parsed = parseControlledSeed(controlled.seed, controlled.temperature);
            return {
              generationSeed: parsed.seed,
              generationTemperature: parsed.temperature,
            };
          } catch (error) {
            void vscode.window.showWarningMessage(
              `Colcoor: ${error instanceof Error ? error.message : String(error)}`,
            );
            return undefined;
          }
        };
        try {
          if (normalized.startsWith("/")) {
            const providerId = resolveProviderId();
            const agentModeRaw =
              vscode.workspace.getConfiguration("colcoor").get<string>("agentMode") ?? "auto";
            const agentMode =
              agentModeRaw === "headless" || agentModeRaw === "stub" || agentModeRaw === "auto"
                ? agentModeRaw
                : "auto";
            const capabilities = resolveProviderSlashCapabilities({
              providerId,
              cliMode: CURSOR_CLI_MODE_ASK,
              agentMode,
            });
            const slash = dispatchSlashCommand({
              text: normalized,
              ctx: {
                conversationId: convId,
                providerId,
                cliMode: CURSOR_CLI_MODE_ASK,
                agentMode,
                workspaceRoot,
                capabilities,
                selectedModel: "auto",
                modelOptions: [],
                providerCommands: resolveProviderCommandCatalog(workspaceRoot, providerId),
              },
            });
            if (slash) {
              if (slash.action === "local" || slash.action === "error") {
                void vscode.window.showInformationMessage(
                  slash.message.length > 400 ? `${slash.message.slice(0, 397)}…` : slash.message,
                );
                return;
              }
              if (slash.action === "resend") {
                void vscode.window.showInformationMessage(
                  "Colcoor: use the conversation panel to resend with /colcoor-resend.",
                );
                return;
              }
              if (slash.action === "turn-transform") {
                const body = slash.userMessage.trim();
                if (!body) {
                  void vscode.window.showInformationMessage(slash.message ?? "Done.");
                  return;
                }
                const generation = generationForMode(slash.patch.cliMode ?? CURSOR_CLI_MODE_ASK);
                if (!generation) return;
                const result = await runColcoorUserTurn(
                  api,
                  agent,
                  convId,
                  convTitle,
                  body,
                  workspaceRoot,
                  {
                    ...(slash.patch.privateBranch || privateBranch ? { privateBranch: true } : {}),
                    ...(slash.patch.cliMode ? { cliMode: slash.patch.cliMode } : {}),
                    ...(slash.patch.cliModel ? { cliModel: slash.patch.cliModel } : {}),
                    ...generation,
                  },
                );
                await notifyUserTurnOutcomeAndSyncConversationPanel(result);
                return;
              }
              if (slash.action === "provider") {
                const generation = generationForMode(CURSOR_CLI_MODE_ASK);
                if (!generation) return;
                const result = await runColcoorUserTurn(
                  api,
                  agent,
                  convId,
                  convTitle,
                  slash.userMessage,
                  workspaceRoot,
                  {
                    ...(privateBranch ? { privateBranch: true } : {}),
                    slashMeta: slash.slashMeta,
                    providerSlashCommand: slash.userMessage,
                    ...generation,
                  },
                );
                await notifyUserTurnOutcomeAndSyncConversationPanel(result);
                return;
              }
            }
          }
          const generation = generationForMode(CURSOR_CLI_MODE_ASK);
          if (!generation) return;
          const result = await runColcoorUserTurn(
            api,
            agent,
            convId,
            convTitle,
            normalized,
            workspaceRoot,
            {
              ...(privateBranch ? { privateBranch: true } : {}),
              ...generation,
            },
          );
          await notifyUserTurnOutcomeAndSyncConversationPanel(result);
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
  ];
}
