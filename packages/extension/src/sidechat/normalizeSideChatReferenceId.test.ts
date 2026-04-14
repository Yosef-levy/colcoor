import { describe, expect, it } from "vitest";

import { normalizeSideChatReferenceId } from "./normalizeSideChatReferenceId";

describe("normalizeSideChatReferenceId", () => {
  it("returns null for null, undefined, non-string, and blank after normalization", () => {
    expect(normalizeSideChatReferenceId(undefined)).toBeNull();
    expect(normalizeSideChatReferenceId(null)).toBeNull();
    expect(normalizeSideChatReferenceId("  \r\n\t  ")).toBeNull();
  });

  it("trims and normalizes line endings", () => {
    expect(normalizeSideChatReferenceId("  id\r\n")).toBe("id");
    expect(normalizeSideChatReferenceId("a\rb")).toBe("a\nb");
  });
});
