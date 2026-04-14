import { describe, expect, it } from "vitest";

import { shouldDisposeSideChatPanelAfterDelete } from "./sideChatDisposeAfterConversationDelete";

describe("shouldDisposeSideChatPanelAfterDelete", () => {
  it("is true only when the delete command reports success", () => {
    expect(shouldDisposeSideChatPanelAfterDelete(true)).toBe(true);
    expect(shouldDisposeSideChatPanelAfterDelete(false)).toBe(false);
    expect(shouldDisposeSideChatPanelAfterDelete(undefined)).toBe(false);
    expect(shouldDisposeSideChatPanelAfterDelete(null)).toBe(false);
  });
});
