import { describe, expect, it } from "vitest";

import { normalizedOptionalFollowUpPrompt } from "./newConversationFirstMessage";

describe("normalizedOptionalFollowUpPrompt", () => {
  it("treats undefined (Esc) as skip", () => {
    expect(normalizedOptionalFollowUpPrompt(undefined)).toBe("");
  });

  it("normalizes CRLF and trims", () => {
    expect(normalizedOptionalFollowUpPrompt("  hi\r\n")).toBe("hi");
  });

  it("returns empty for whitespace-only", () => {
    expect(normalizedOptionalFollowUpPrompt("  \t\r\n  ")).toBe("");
  });
});
