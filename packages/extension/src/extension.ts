import * as vscode from "vscode";
import { scheduleCursorCliPresenceCheck } from "./agent/cursorCliSetup";
import { bootstrapColcoor } from "./activation/bootstrapColcoor";
import { registerAuthCommands } from "./commands/registerAuthCommands";
import { registerConversationCommands } from "./commands/registerConversationCommands";
import { registerDrawersCommands } from "./commands/registerDrawersCommands";
import { registerMemberCommands } from "./commands/registerMemberCommands";
import { registerMessagePanelCommands } from "./commands/registerMessagePanelCommands";
import { registerNavigationCommands } from "./commands/registerNavigationCommands";
import { registerSendMessageCommands } from "./commands/registerSendMessageCommands";
import { registerSettingsCommands } from "./commands/registerSettingsCommands";
import { registerSetupCommands } from "./commands/registerSetupCommands";
import { registerListAgentCommands } from "./commands/registerListAgentCommands";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const { deps, completeActivation } = await bootstrapColcoor(context);

  context.subscriptions.push(
    ...registerSetupCommands(deps),
    ...registerAuthCommands(deps),
    ...registerConversationCommands(deps),
    ...registerMemberCommands(deps),
    ...registerSettingsCommands(deps),
    ...registerMessagePanelCommands(deps),
    ...registerNavigationCommands(deps),
    ...registerDrawersCommands(deps),
    ...registerSendMessageCommands(deps),
    ...registerListAgentCommands(deps),
  );

  scheduleCursorCliPresenceCheck(context);
  completeActivation();
}

export function deactivate(): void {}
