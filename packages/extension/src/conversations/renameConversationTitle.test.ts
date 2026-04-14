import { describe, expect, it } from "vitest";

import { normalizedConversationTitle } from "./renameConversationTitle";

describe("normalizedConversationTitle", () => {
  it("returns null for blank text", () => {
    expect(normalizedConversationTitle("")).toBeNull();
    expect(normalizedConversationTitle("   ")).toBeNull();
    expect(normalizedConversationTitle("  \n\t  ")).toBeNull();
  });

  it("returns trimmed text for non-empty title", () => {
    expect(normalizedConversationTitle("  Hello world  ")).toBe("Hello world");
  });
});
