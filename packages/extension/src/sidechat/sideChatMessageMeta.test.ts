import { describe, expect, it } from "vitest";

import { formatSideChatMessageMetaLabel } from "./sideChatMessageMeta";

describe("formatSideChatMessageMetaLabel", () => {
  const now = Date.parse("2026-05-17T14:00:00.000Z");

  it("returns empty when created_at is missing", () => {
    expect(formatSideChatMessageMetaLabel(null, null, now)).toBe("");
  });

  it("returns relative time without edited suffix", () => {
    const created = "2026-05-17T13:50:00.000Z";
    expect(formatSideChatMessageMetaLabel(created, null, now)).toBe("10 minutes ago");
  });

  it("appends (edited) when edited_at is set", () => {
    const created = "2026-05-17T13:50:00.000Z";
    const edited = "2026-05-17T13:55:00.000Z";
    expect(formatSideChatMessageMetaLabel(created, edited, now)).toBe("10 minutes ago (edited)");
  });
});
