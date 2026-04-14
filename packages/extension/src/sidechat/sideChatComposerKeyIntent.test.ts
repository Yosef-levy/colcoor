import { describe, expect, it } from "vitest";

import { shouldSendSideChatOnKeydown } from "./sideChatComposerKeyIntent";

describe("shouldSendSideChatOnKeydown", () => {
  it("returns true for bare Enter", () => {
    expect(shouldSendSideChatOnKeydown({ key: "Enter" })).toBe(true);
  });

  it("returns false for non-Enter keys", () => {
    expect(shouldSendSideChatOnKeydown({ key: "a" })).toBe(false);
  });

  it("returns false for Shift+Enter", () => {
    expect(shouldSendSideChatOnKeydown({ key: "Enter", shiftKey: true })).toBe(false);
  });

  it("returns false for modified Enter combos", () => {
    expect(shouldSendSideChatOnKeydown({ key: "Enter", ctrlKey: true })).toBe(false);
    expect(shouldSendSideChatOnKeydown({ key: "Enter", altKey: true })).toBe(false);
    expect(shouldSendSideChatOnKeydown({ key: "Enter", metaKey: true })).toBe(false);
  });

  it("returns false while IME composition is active", () => {
    expect(shouldSendSideChatOnKeydown({ key: "Enter", isComposing: true })).toBe(false);
  });
});
