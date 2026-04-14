import { describe, expect, it } from "vitest";

import { readSideChatCueSettings } from "./sideChatWorkspaceSettings";

describe("readSideChatCueSettings", () => {
  it("defaults to true when keys are missing or non-boolean", () => {
    expect(readSideChatCueSettings({ get: () => undefined })).toEqual({
      notificationsEnabled: true,
      mentionNotificationsEnabled: true,
      messageSoundEnabled: true,
      mentionSoundEnabled: true,
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
        })[key],
    });
    expect(s).toEqual({
      notificationsEnabled: false,
      mentionNotificationsEnabled: true,
      messageSoundEnabled: false,
      mentionSoundEnabled: true,
    });
  });
});
