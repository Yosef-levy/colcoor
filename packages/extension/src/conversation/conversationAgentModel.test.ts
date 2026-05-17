import { describe, expect, it, vi } from "vitest";

import {
  AGENT_MODEL_AUTO,
  agentModelCliFlag,
  readAgentModelByConversationMap,
  readSelectedAgentModelForConversation,
  writeSelectedAgentModelForConversation,
} from "./conversationAgentModel";

describe("conversationAgentModel", () => {
  it("defaults to automatic", () => {
    expect(readSelectedAgentModelForConversation({}, "conv-1")).toBe(AGENT_MODEL_AUTO);
    expect(agentModelCliFlag(AGENT_MODEL_AUTO)).toBeUndefined();
    expect(agentModelCliFlag("sonnet-4")).toBe("sonnet-4");
  });

  it("persists per conversation in workspace state", async () => {
    const store = new Map<string, unknown>();
    const workspaceState = {
      get: vi.fn((key: string) => store.get(key)),
      update: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    };
    await writeSelectedAgentModelForConversation(workspaceState, "a", "gpt-5.2");
    await writeSelectedAgentModelForConversation(workspaceState, "b", AGENT_MODEL_AUTO);
    const map = readAgentModelByConversationMap(workspaceState);
    expect(map).toEqual({ a: "gpt-5.2" });
    expect(readSelectedAgentModelForConversation(map, "a")).toBe("gpt-5.2");
    expect(readSelectedAgentModelForConversation(map, "b")).toBe(AGENT_MODEL_AUTO);
  });
});
