import { describe, expect, it } from "vitest";

import {
  COLCOOR_CONVERSATION_PANEL_OPEN_CONTEXT,
  COLCOOR_CONVERSATION_REPLY_IN_PROGRESS_CONTEXT,
} from "./colcoorContextKeys";

describe("colcoorContextKeys", () => {
  it("matches package.json enablement for stopGeneration", () => {
    expect(COLCOOR_CONVERSATION_REPLY_IN_PROGRESS_CONTEXT).toBe("colcoor.conversationReplyInProgress");
  });

  it("exposes the conversation panel open key for default keybindings ([tree-ui-contract.md] §6)", () => {
    expect(COLCOOR_CONVERSATION_PANEL_OPEN_CONTEXT).toBe("colcoor.conversationPanelOpen");
  });
});
