import { describe, expect, it } from "vitest";

import { formatConversationUpdatedAtForTooltip } from "./conversationListUpdatedAt";

describe("formatConversationUpdatedAtForTooltip", () => {
  it("returns empty for missing or invalid values", () => {
    expect(formatConversationUpdatedAtForTooltip(undefined)).toBe("");
    expect(formatConversationUpdatedAtForTooltip("")).toBe("");
    expect(formatConversationUpdatedAtForTooltip("  ")).toBe("");
    expect(formatConversationUpdatedAtForTooltip("not-a-date")).toBe("");
  });

  it("formats UTC timestamps in en-US for stable tooltips", () => {
    expect(formatConversationUpdatedAtForTooltip("2024-06-15T14:30:00.000Z")).toBe("Jun 15, 2024, 2:30 PM");
    expect(formatConversationUpdatedAtForTooltip("2024-01-01T00:00:00.000Z")).toBe("Jan 1, 2024, 12:00 AM");
  });
});
