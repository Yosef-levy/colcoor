import { describe, expect, it, vi } from "vitest";

import {
  controlledSeedUnavailableReason,
  parseControlledSeed,
  randomGenerationSeed,
  readControlledSeedByConversationMap,
  readControlledSeedForConversation,
  writeControlledSeedForConversation,
} from "./conversationControlledSeed";

describe("conversationControlledSeed", () => {
  it("defaults off and persists independent conversation values", async () => {
    const store = new Map<string, unknown>();
    const workspaceState = {
      get: vi.fn((key: string) => store.get(key)),
      update: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    };

    expect(readControlledSeedForConversation({}, "missing")).toEqual({
      enabled: false,
      seed: "",
      temperature: "0",
    });
    await writeControlledSeedForConversation(workspaceState, "a", {
      enabled: true,
      seed: "42",
      temperature: "0",
    });
    await writeControlledSeedForConversation(workspaceState, "b", {
      seed: "7",
      temperature: "0.25",
    });

    const map = readControlledSeedByConversationMap(workspaceState);
    expect(map.a).toEqual({ enabled: true, seed: "42", temperature: "0" });
    expect(map.b).toEqual({ enabled: false, seed: "7", temperature: "0.25" });
  });

  it("validates Gemini seed and temperature ranges", () => {
    expect(parseControlledSeed("123", "")).toEqual({ seed: 123, temperature: 0 });
    expect(parseControlledSeed("0", "2")).toEqual({ seed: 0, temperature: 2 });
    expect(() => parseControlledSeed("-1", "0")).toThrow("integer");
    expect(() => parseControlledSeed("1.5", "0")).toThrow("integer");
    expect(() => parseControlledSeed("1", "2.1")).toThrow("0 to 2");
  });

  it("is available only for Gemini Ask", () => {
    expect(controlledSeedUnavailableReason("gemini", "ask")).toBeUndefined();
    expect(controlledSeedUnavailableReason("gemini", "agent")).toContain("Gemini");
    expect(controlledSeedUnavailableReason("anthropic", "ask")).toContain("Gemini");
  });

  it("generates a bounded integer seed", () => {
    expect(randomGenerationSeed(() => 0)).toBe("0");
    expect(randomGenerationSeed(() => 0.5)).toBe("1073741824");
  });
});
