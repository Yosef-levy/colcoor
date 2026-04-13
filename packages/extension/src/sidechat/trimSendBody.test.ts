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
});
