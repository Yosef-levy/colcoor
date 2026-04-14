import { describe, expect, it } from "vitest";

import { normalizedOptionalFirstMessageFromSecondPrompt } from "./newConversationFirstMessage";

describe("normalizedOptionalFirstMessageFromSecondPrompt", () => {
  it("treats undefined (Esc) as skip", () => {
    expect(normalizedOptionalFirstMessageFromSecondPrompt(undefined)).toBe("");
  });

  it("normalizes CRLF and trims", () => {
    expect(normalizedOptionalFirstMessageFromSecondPrompt("  hi\r\n")).toBe("hi");
  });

  it("returns empty for whitespace-only", () => {
    expect(normalizedOptionalFirstMessageFromSecondPrompt("  \t\r\n  ")).toBe("");
  });
});
