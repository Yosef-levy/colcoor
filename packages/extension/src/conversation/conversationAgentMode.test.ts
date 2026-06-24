import { describe, expect, it, vi } from "vitest";

import {
  readAgentModeByConversationMap,
  readSelectedAgentModeForConversation,
  writeSelectedAgentModeForConversation,
} from "./conversationAgentMode";

describe("conversationAgentMode", () => {
  it("defaults to ask", () => {
    expect(readSelectedAgentModeForConversation({}, "conv-1")).toBe("ask");
  });

  it("persists per conversation in workspace state", async () => {
    const store = new Map<string, unknown>();
    const workspaceState = {
      get: vi.fn((key: string) => store.get(key)),
      update: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    };
    await writeSelectedAgentModeForConversation(workspaceState, "a", "agent");
    await writeSelectedAgentModeForConversation(workspaceState, "b", "ask");
    await writeSelectedAgentModeForConversation(workspaceState, "c", "plan");
    const map = readAgentModeByConversationMap(workspaceState);
    expect(map).toEqual({ a: "agent", c: "plan" });
    expect(readSelectedAgentModeForConversation(map, "a")).toBe("agent");
    expect(readSelectedAgentModeForConversation(map, "b")).toBe("ask");
    expect(readSelectedAgentModeForConversation(map, "c")).toBe("plan");
  });
});
