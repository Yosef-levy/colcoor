import { describe, expect, it, vi } from "vitest";

import { TOGGLE_SIDEBAR_COMMAND_ID, toggleSidebarVisibility } from "./toggleSidebarVisibility";

describe("toggleSidebarVisibility", () => {
  it("executes VS Code sidebar toggle command", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    await toggleSidebarVisibility(exec);
    expect(exec).toHaveBeenCalledWith(TOGGLE_SIDEBAR_COMMAND_ID);
  });
});
