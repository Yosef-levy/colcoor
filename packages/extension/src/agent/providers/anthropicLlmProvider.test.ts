import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: { getConfiguration: () => ({ get: () => undefined }) },
}));

import { cacheBreakpointIndex, toApiMessages } from "./anthropicLlmProvider";
import type { LlmMessage } from "./types";

describe("cacheBreakpointIndex", () => {
  it("caches the message just before the trailing new user turn", () => {
    expect(cacheBreakpointIndex(3)).toBe(1);
  });

  it("caches the only message when there is a single turn", () => {
    expect(cacheBreakpointIndex(1)).toBe(0);
  });

  it("has no breakpoint for an empty message list", () => {
    expect(cacheBreakpointIndex(0)).toBeUndefined();
  });
});

describe("toApiMessages", () => {
  it("emits image blocks after text and keeps cache_control on the breakpoint text", () => {
    const messages: LlmMessage[] = [
      { role: "user", content: "prior" },
      { role: "assistant", content: "ok" },
      {
        role: "user",
        content: "see this",
        images: [{ mimeType: "image/png", dataBase64: "AAAA" }],
      },
    ];
    const api = toApiMessages(messages, "5m");
    expect(api).toHaveLength(3);
    const breakpoint = api[1];
    expect(breakpoint.role).toBe("assistant");
    expect(Array.isArray(breakpoint.content)).toBe(true);
    const cached = (breakpoint.content as { type: string; cache_control?: unknown }[])[0];
    expect(cached.type).toBe("text");
    expect(cached.cache_control).toEqual({ type: "ephemeral", ttl: "5m" });

    const last = api[2];
    expect(last.role).toBe("user");
    expect(Array.isArray(last.content)).toBe(true);
    const blocks = last.content as { type: string }[];
    expect(blocks[0]).toMatchObject({ type: "text", text: "see this" });
    expect(blocks[1]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAA" },
    });
  });

  it("keeps plain string content when there are no images and no cache on that message", () => {
    const api = toApiMessages([{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }], "1h");
    // breakpoint is index 0 (user) when length=2 → messageCount-2=0
    expect(api[0].role).toBe("user");
    expect(Array.isArray(api[0].content)).toBe(true);
    expect(api[1].content).toBe("yo");
  });
});
