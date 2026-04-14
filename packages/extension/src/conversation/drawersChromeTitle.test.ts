import { describe, expect, it } from "vitest";

import {
  formatColcoorDrawersChromeTitle,
  shouldCloseDrawersAfterConversationDelete,
} from "./drawersChromeTitle";

describe("formatColcoorDrawersChromeTitle", () => {
  it("uses the conversation title when non-empty after trim", () => {
    expect(formatColcoorDrawersChromeTitle("My thread")).toBe("Colcoor — Drawers · My thread");
  });

  it("falls back to (untitled) for null, blank, or whitespace", () => {
    expect(formatColcoorDrawersChromeTitle(null)).toBe("Colcoor — Drawers · (untitled)");
    expect(formatColcoorDrawersChromeTitle("")).toBe("Colcoor — Drawers · (untitled)");
    expect(formatColcoorDrawersChromeTitle("  \t")).toBe("Colcoor — Drawers · (untitled)");
  });
});

describe("shouldCloseDrawersAfterConversationDelete", () => {
  it("returns true when the open drawers conversation matches the deleted id", () => {
    expect(shouldCloseDrawersAfterConversationDelete("c-1", "c-1")).toBe(true);
  });

  it("returns false when there is no open drawers conversation", () => {
    expect(shouldCloseDrawersAfterConversationDelete(undefined, "c-1")).toBe(false);
  });

  it("returns false when ids differ", () => {
    expect(shouldCloseDrawersAfterConversationDelete("c-1", "c-2")).toBe(false);
  });
});
