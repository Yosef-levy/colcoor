import { describe, expect, it } from "vitest";

import { shouldAutoRefreshConversations } from "./conversationAutoRefreshPolicy";

describe("shouldAutoRefreshConversations", () => {
  it("returns false without token", () => {
    expect(shouldAutoRefreshConversations({ hasBackendToken: false, treeVisible: true })).toBe(false);
  });

  it("returns false when tree is hidden", () => {
    expect(shouldAutoRefreshConversations({ hasBackendToken: true, treeVisible: false })).toBe(false);
  });

  it("returns true when signed in and tree visible", () => {
    expect(shouldAutoRefreshConversations({ hasBackendToken: true, treeVisible: true })).toBe(true);
  });
});
