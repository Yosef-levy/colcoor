/**
 * Side-chat notification + sound toggles from the `colcoor` workspace configuration.
 * Read on each inbound SSE event so changes apply without reopening the panel.
 */

export type SideChatCueSettings = {
  notificationsEnabled: boolean;
  mentionNotificationsEnabled: boolean;
  messageSoundEnabled: boolean;
  mentionSoundEnabled: boolean;
};

function boolFromConfig(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

/** Same `.get` shape as `vscode.WorkspaceConfiguration`. */
export function readSideChatCueSettings(section: { get: (key: string) => unknown }): SideChatCueSettings {
  return {
    notificationsEnabled: boolFromConfig(section.get("sideChatNotificationsEnabled"), true),
    mentionNotificationsEnabled: boolFromConfig(section.get("sideChatMentionNotificationsEnabled"), true),
    messageSoundEnabled: boolFromConfig(section.get("sideChatSoundEnabled"), true),
    mentionSoundEnabled: boolFromConfig(section.get("sideChatMentionSoundEnabled"), true),
  };
}
