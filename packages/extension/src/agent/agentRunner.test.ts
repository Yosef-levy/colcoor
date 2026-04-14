import { describe, expect, it, vi, beforeEach } from "vitest";

const configGet = vi.hoisted(() =>
  vi.fn((key: string, defaultValue?: unknown) => {
    switch (key) {
      case "agentMode":
        return "stub";
      case "agentExecutable":
        return "agent";
      case "agentTimeoutMs":
        return 300_000;
      case "agentOutputFormat":
        return "stream-json-partial";
      default:
        return defaultValue;
    }
  }),
);

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({ get: configGet }),
  },
}));

import type { SecretStorage } from "vscode";
import { AgentRunner } from "./agentRunner";

describe("AgentRunner stub mode", () => {
  beforeEach(() => {
    configGet.mockClear();
    configGet.mockImplementation((key: string, defaultValue?: unknown) => {
      switch (key) {
        case "agentMode":
          return "stub";
        case "agentExecutable":
          return "agent";
        case "agentTimeoutMs":
          return 300_000;
        case "agentOutputFormat":
          return "stream-json-partial";
        default:
          return defaultValue;
      }
    });
  });

  it("echoes CRLF-normalized user text in stub reply", async () => {
    const secrets = {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      onDidChange: vi.fn(),
    } as unknown as SecretStorage;
    const runner = new AgentRunner(secrets);
    const out = await runner.run({
      transcriptText: "<<<USER>>>\nx\n<<<END USER>>>",
      userMessage: "  line\r\n2  ",
      workspaceRoot: "/tmp",
    });
    expect(out.stub).toBe("explicit");
    expect(out.text).toContain("You wrote:\nline\n2");
    expect(out.text).not.toMatch(/\r/);
  });
});
