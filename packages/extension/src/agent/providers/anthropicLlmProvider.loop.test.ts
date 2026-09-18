import { beforeEach, describe, expect, it, vi } from "vitest";

const streamMock = vi.fn();
const secretsGet = vi.fn();

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === "askModel") {
          return "claude-sonnet-4-5";
        }
        if (key === "promptCacheTtl") {
          return "5m";
        }
        return undefined;
      },
    }),
  },
}));

vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { stream: streamMock };
    constructor(_opts: { apiKey: string }) {}
  }
  return { default: Anthropic };
});

vi.mock("./workspaceReadFileTool", () => ({
  executeWorkspaceReadFile: vi.fn(async (_root: string, p: string) => ({
    content: `FILE:${p}`,
    isError: false,
  })),
}));

import { AnthropicLlmProvider } from "./anthropicLlmProvider";
import { executeWorkspaceReadFile } from "./workspaceReadFileTool";

function usage(input = 10, output = 5) {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
    cache_creation: null,
    output_tokens_details: null,
    inference_geo: null,
    server_tool_use: null,
    service_tier: "standard" as const,
  };
}

function makeStream(finalMessage: unknown) {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    on(event: string, cb: (...args: unknown[]) => void) {
      (handlers[event] ??= []).push(cb);
      return this;
    },
    async finalMessage() {
      const text = (finalMessage as { content: { type: string; text?: string }[] }).content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      for (const cb of handlers.text ?? []) {
        if (text) {
          cb(text);
        }
      }
      return finalMessage;
    },
  };
}

describe("AnthropicLlmProvider tool loop", () => {
  beforeEach(() => {
    streamMock.mockReset();
    secretsGet.mockReset();
    secretsGet.mockResolvedValue("sk-test");
    vi.mocked(executeWorkspaceReadFile).mockClear();
  });

  it("executes read_file on tool_use then returns end_turn text", async () => {
    streamMock
      .mockReturnValueOnce(
        makeStream({
          id: "msg_1",
          model: "claude-sonnet-4-5",
          stop_reason: "tool_use",
          usage: usage(11, 2),
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "read_file",
              input: { path: "src/a.ts" },
            },
          ],
        }),
      )
      .mockReturnValueOnce(
        makeStream({
          id: "msg_2",
          model: "claude-sonnet-4-5",
          stop_reason: "end_turn",
          usage: usage(20, 8),
          content: [{ type: "text", text: "The file says hello." }],
        }),
      );

    const provider = new AnthropicLlmProvider({ get: secretsGet } as never);
    const result = await provider.run({
      transcriptText: "",
      userMessage: "read a",
      workspaceRoot: "/ws",
      llmRequest: {
        system: "sys",
        messages: [{ role: "user", content: "read a" }],
      },
      cliMode: "ask",
    });

    expect(result.text).toBe("The file says hello.");
    expect(executeWorkspaceReadFile).toHaveBeenCalledWith("/ws", "src/a.ts");
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(result.providerUsage?.tokens.input).toBe(31);
    expect(result.providerUsage?.tokens.output).toBe(10);
    expect(result.providerUsage?.num_turns).toBe(2);
  });

  it("continues on pause_turn without client tools", async () => {
    streamMock
      .mockReturnValueOnce(
        makeStream({
          id: "msg_p1",
          model: "claude-sonnet-4-5",
          stop_reason: "pause_turn",
          usage: usage(5, 1),
          content: [
            { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "q" } },
          ],
        }),
      )
      .mockReturnValueOnce(
        makeStream({
          id: "msg_p2",
          model: "claude-sonnet-4-5",
          stop_reason: "end_turn",
          usage: usage(6, 4),
          content: [{ type: "text", text: "Search done." }],
        }),
      );

    const provider = new AnthropicLlmProvider({ get: secretsGet } as never);
    const result = await provider.run({
      transcriptText: "",
      userMessage: "search",
      workspaceRoot: "/ws",
      llmRequest: {
        system: "sys",
        messages: [{ role: "user", content: "search" }],
      },
      cliMode: "ask",
    });

    expect(result.text).toBe("Search done.");
    expect(executeWorkspaceReadFile).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledTimes(2);
  });
});
