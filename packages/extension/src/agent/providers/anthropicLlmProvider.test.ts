import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: { getConfiguration: () => ({ get: () => undefined }) },
}));

import { cacheBreakpointIndex } from "./anthropicLlmProvider";

describe("cacheBreakpointIndex", () => {
  it("caches the message just before the trailing new user turn", () => {
    // [user, assistant, newUser] -> cache the assistant at index 1.
    expect(cacheBreakpointIndex(3)).toBe(1);
  });

  it("caches the only message when there is a single turn", () => {
    expect(cacheBreakpointIndex(1)).toBe(0);
  });

  it("has no breakpoint for an empty message list", () => {
    expect(cacheBreakpointIndex(0)).toBeUndefined();
  });
});
