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

  it("normalizes CRLF and collapses newlines to spaces", () => {
    expect(normalizedConversationTitle("a\r\nb")).toBe("a b");
    expect(normalizedConversationTitle("x\ry")).toBe("x y");
    expect(normalizedConversationTitle("one\ntwo\nthree")).toBe("one two three");
  });

  it("collapses runs of spaces and tabs", () => {
    expect(normalizedConversationTitle("a \t b")).toBe("a b");
  });
});
