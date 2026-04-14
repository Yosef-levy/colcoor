import { describe, expect, it } from "vitest";

import { COLCOOR_CONVERSATION_REPLY_IN_PROGRESS_CONTEXT } from "./colcoorContextKeys";

describe("colcoorContextKeys", () => {
  it("matches package.json enablement for stopGeneration", () => {
    expect(COLCOOR_CONVERSATION_REPLY_IN_PROGRESS_CONTEXT).toBe("colcoor.conversationReplyInProgress");
  });
});
