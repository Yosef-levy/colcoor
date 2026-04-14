import { describe, expect, it, vi } from "vitest";

import {
  COLOOR_EXTENSION_SETTINGS_QUERY,
  OPEN_SETTINGS_COMMAND_ID,
  openColcoorSettings,
} from "./openColcoorSettings";

describe("openColcoorSettings", () => {
  it("opens VS Code settings filtered to Colcoor extension", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    await openColcoorSettings(exec);
    expect(exec).toHaveBeenCalledWith(OPEN_SETTINGS_COMMAND_ID, COLOOR_EXTENSION_SETTINGS_QUERY);
  });

  it("appends searchSuffix to narrow the settings search", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    await openColcoorSettings(exec, { searchSuffix: "legal" });
    expect(exec).toHaveBeenCalledWith(
      OPEN_SETTINGS_COMMAND_ID,
      `${COLOOR_EXTENSION_SETTINGS_QUERY} legal`,
    );
  });

  it("supports side-chat settings narrowing used by colcoor.openSideChatSoundSettings", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    await openColcoorSettings(exec, { searchSuffix: "side chat" });
    expect(exec).toHaveBeenCalledWith(
      OPEN_SETTINGS_COMMAND_ID,
      `${COLOOR_EXTENSION_SETTINGS_QUERY} side chat`,
    );
  });
});
