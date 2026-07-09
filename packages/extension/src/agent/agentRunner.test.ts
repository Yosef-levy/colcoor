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

const spawnCursorAgentPrintMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    stdout: "cli-ok",
    stderr: "",
    exitCode: 0,
  }),
);

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({ get: configGet }),
  },
}));

vi.mock("./cursorCliSpawn", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./cursorCliSpawn")>();
  return {
    ...mod,
    spawnCursorAgentPrint: spawnCursorAgentPrintMock,
  };
});

import type { SecretStorage } from "vscode";
import { AgentRunner } from "./agentRunner";

describe("AgentRunner stub mode", () => {
  beforeEach(() => {
    spawnCursorAgentPrintMock.mockClear();
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
    expect(spawnCursorAgentPrintMock).not.toHaveBeenCalled();
  });
});

describe("AgentRunner headless (mocked spawn)", () => {
  beforeEach(() => {
    spawnCursorAgentPrintMock.mockClear();
    spawnCursorAgentPrintMock.mockResolvedValue({
      stdout: "cli-ok",
      stderr: "",
      exitCode: 0,
    });
    configGet.mockClear();
    configGet.mockImplementation((key: string, defaultValue?: unknown) => {
      switch (key) {
        case "provider":
          return "cursor";
        case "agentMode":
          return "headless";
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

  it("concatenates CRLF-normalized workspace appendix onto the transcript prompt", async () => {
    const secrets = {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      onDidChange: vi.fn(),
    } as unknown as SecretStorage;
    const runner = new AgentRunner(secrets);
    await runner.run({
      transcriptText: "TRANSCRIPT",
      userMessage: "hi",
      workspaceRoot: "/tmp/ws",
      workspaceContextAppendix: "  ctx\r\nblock  ",
    });
    expect(spawnCursorAgentPrintMock).toHaveBeenCalledTimes(1);
    expect(spawnCursorAgentPrintMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        prompt: "TRANSCRIPTctx\nblock",
      }),
    );
  });

  it("omits blank appendix after normalization (prompt is transcript only)", async () => {
    const secrets = {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      onDidChange: vi.fn(),
    } as unknown as SecretStorage;
    const runner = new AgentRunner(secrets);
    await runner.run({
      transcriptText: "ONLY",
      userMessage: "hi",
      workspaceRoot: "/tmp/ws",
      workspaceContextAppendix: "  \r\n\t  ",
    });
    expect(spawnCursorAgentPrintMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "ONLY" }),
    );
  });
});
