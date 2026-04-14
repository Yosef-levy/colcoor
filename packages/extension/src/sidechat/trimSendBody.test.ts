import { describe, expect, it } from "vitest";
import { trimmedSideChatSendBody } from "./trimSendBody";

describe("trimmedSideChatSendBody", () => {
  it("returns null for undefined or whitespace-only", () => {
    expect(trimmedSideChatSendBody(undefined)).toBeNull();
    expect(trimmedSideChatSendBody("")).toBeNull();
    expect(trimmedSideChatSendBody("  \n\t")).toBeNull();
  });

  it("trims leading and trailing space", () => {
    expect(trimmedSideChatSendBody("  hi  ")).toBe("hi");
  });

  it("normalizes CRLF and lone CR to LF before trim", () => {
    expect(trimmedSideChatSendBody("a\r\nb")).toBe("a\nb");
    expect(trimmedSideChatSendBody("x\ry")).toBe("x\ny");
  });

  it("preserves intentional internal newlines as LF", () => {
    expect(trimmedSideChatSendBody("  line1\r\nline2  ")).toBe("line1\nline2");
  });
});
