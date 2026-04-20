import { describe, expect, it } from "vitest";

import { readSideChatCueSettings } from "./sideChatWorkspaceSettings";

describe("readSideChatCueSettings", () => {
  it("defaults to true when keys are missing or non-boolean", () => {
    expect(readSideChatCueSettings({ get: () => undefined })).toEqual({
      notificationsEnabled: true,
      mentionNotificationsEnabled: true,
      messageSoundEnabled: true,
      mentionSoundEnabled: true,
      soundVolume: 0.7,
    });
  });

  it("reads booleans from a vscode-like section.get", () => {
    const s = readSideChatCueSettings({
      get: (key: string) =>
        ({
          sideChatNotificationsEnabled: false,
          sideChatMentionNotificationsEnabled: true,
          sideChatSoundEnabled: false,
          sideChatMentionSoundEnabled: true,
          sideChatSoundVolume: 35,
        })[key],
    });
    expect(s).toEqual({
      notificationsEnabled: false,
      mentionNotificationsEnabled: true,
      messageSoundEnabled: false,
      mentionSoundEnabled: true,
      soundVolume: 0.35,
    });
  });

  it("clamps volume to [0, 1] and defaults for invalid values", () => {
    const s0 = readSideChatCueSettings({ get: (k: string) => (k === "sideChatSoundVolume" ? -5 : undefined) });
    expect(s0.soundVolume).toBe(0);
    const s1 = readSideChatCueSettings({ get: (k: string) => (k === "sideChatSoundVolume" ? 500 : undefined) });
    expect(s1.soundVolume).toBe(1);
    const sd = readSideChatCueSettings({ get: (k: string) => (k === "sideChatSoundVolume" ? "loud" : undefined) });
    expect(sd.soundVolume).toBe(0.7);
  });
});
