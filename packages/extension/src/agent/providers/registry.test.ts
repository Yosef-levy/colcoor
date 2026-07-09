import { describe, expect, it, vi } from "vitest";

const configValues = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => configValues.current[key],
    }),
  },
}));

import type { SecretStorage } from "vscode";
import { selectAgentBackend } from "./registry";
import { AnthropicLlmProvider } from "./anthropicLlmProvider";
import { ClaudeAgentProvider } from "./claudeAgentProvider";
import { CursorCliAgentProvider } from "./cursorCliAgentProvider";

const secrets = {
  get: vi.fn(),
  store: vi.fn(),
  delete: vi.fn(),
  onDidChange: vi.fn(),
} as unknown as SecretStorage;

function withConfig(values: Record<string, unknown>): void {
  configValues.current = values;
}

describe("selectAgentBackend", () => {
  it("returns stub when agentMode is stub regardless of provider", () => {
    withConfig({ provider: "anthropic" });
    expect(selectAgentBackend(secrets, { agentMode: "stub", cliMode: "ask" })).toEqual({
      kind: "stub",
    });
  });

  it("uses the Anthropic Messages provider for ask mode", () => {
    withConfig({ provider: "anthropic" });
    const sel = selectAgentBackend(secrets, { agentMode: "auto", cliMode: "ask" });
    expect(sel.kind).toBe("backend");
    if (sel.kind === "backend") {
      expect(sel.backend).toBeInstanceOf(AnthropicLlmProvider);
    }
  });

  it("uses the Claude Agent SDK provider for plan and agent modes", () => {
    withConfig({ provider: "anthropic" });
    for (const cliMode of ["plan", "agent"] as const) {
      const sel = selectAgentBackend(secrets, { agentMode: "auto", cliMode });
      expect(sel.kind).toBe("backend");
      if (sel.kind === "backend") {
        expect(sel.backend).toBeInstanceOf(ClaudeAgentProvider);
      }
    }
  });

  it("uses the legacy Cursor CLI provider when provider is cursor", () => {
    withConfig({ provider: "cursor" });
    const sel = selectAgentBackend(secrets, { agentMode: "auto", cliMode: "agent" });
    expect(sel.kind).toBe("backend");
    if (sel.kind === "backend") {
      expect(sel.backend).toBeInstanceOf(CursorCliAgentProvider);
    }
  });

  it("defaults to Anthropic when provider is unset", () => {
    withConfig({});
    const sel = selectAgentBackend(secrets, { agentMode: "auto", cliMode: "ask" });
    expect(sel.kind).toBe("backend");
    if (sel.kind === "backend") {
      expect(sel.backend).toBeInstanceOf(AnthropicLlmProvider);
    }
  });
});
