/**
 * Side-chat notification + sound toggles from the `colcoor` workspace configuration.
 * Read on each inbound SSE event so changes apply without reopening the panel.
 */

export type SideChatCueSettings = {
  notificationsEnabled: boolean;
  mentionNotificationsEnabled: boolean;
  messageSoundEnabled: boolean;
  mentionSoundEnabled: boolean;
  /** Linear 0..1 gain multiplier for side-chat sounds. */
  soundVolume: number;
};

function boolFromConfig(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function volumeFromConfig(value: unknown, defaultValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultValue;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 100) {
    return 1;
  }
  return value / 100;
}

/** Same `.get` shape as `vscode.WorkspaceConfiguration`. */
export function readSideChatCueSettings(section: { get: (key: string) => unknown }): SideChatCueSettings {
  return {
    notificationsEnabled: boolFromConfig(section.get("sideChatNotificationsEnabled"), true),
    mentionNotificationsEnabled: boolFromConfig(section.get("sideChatMentionNotificationsEnabled"), true),
    messageSoundEnabled: boolFromConfig(section.get("sideChatSoundEnabled"), true),
    mentionSoundEnabled: boolFromConfig(section.get("sideChatMentionSoundEnabled"), true),
    soundVolume: volumeFromConfig(section.get("sideChatSoundVolume"), 0.7),
  };
}
