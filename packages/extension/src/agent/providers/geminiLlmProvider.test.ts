import { describe, expect, it, vi } from "vitest";

const { generateContentStream } = vi.hoisted(() => ({
  generateContentStream: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { NONE: "NONE", VALIDATED: "VALIDATED" },
  GoogleGenAI: class {
    models = { generateContentStream };
  },
  Type: { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER" },
}));

vi.mock("vscode", () => ({
  workspace: { getConfiguration: () => ({ get: () => undefined }) },
}));

import {
  GEMINI_ASK_FINAL_TOOL_CONFIG,
  GEMINI_ASK_TOOL_CONFIG,
  GeminiLlmProvider,
  geminiGenerationControls,
  toGeminiContents,
} from "./geminiLlmProvider";

describe("Gemini request mapping", () => {
  it("enables server-side invocations when mixing hosted and function tools", () => {
    expect(GEMINI_ASK_TOOL_CONFIG).toEqual({
      functionCallingConfig: { mode: "VALIDATED" },
      includeServerSideToolInvocations: true,
    });
    expect(GEMINI_ASK_FINAL_TOOL_CONFIG).toEqual({
      functionCallingConfig: { mode: "NONE" },
    });
  });

  it("maps assistant role to model and images to inlineData", () => {
    expect(
      toGeminiContents([
        {
          role: "user",
          content: "look",
          images: [{ mimeType: "image/png", dataBase64: "abc" }],
        },
        { role: "assistant", content: "seen" },
      ]),
    ).toEqual([
      {
        role: "user",
        parts: [
          { text: "look" },
          { inlineData: { mimeType: "image/png", data: "abc" } },
        ],
      },
      { role: "model", parts: [{ text: "seen" }] },
    ]);
  });

  it("synthesizes without tools after exhausting the bounded tool loop", async () => {
    let request = 0;
    generateContentStream.mockImplementation(async () => {
      request += 1;
      const part =
        request <= 8
          ? { functionCall: { name: "unknown_tool", args: {} } }
          : { text: "Final answer" };
      return (async function* () {
        yield { candidates: [{ content: { parts: [part] }, finishReason: "STOP" }] };
      })();
    });

    const provider = new GeminiLlmProvider({
      get: vi.fn().mockResolvedValue("test-key"),
    } as never);
    const result = await provider.run({
      transcriptText: "Identify",
      userMessage: "Identify",
      workspaceRoot: process.cwd(),
      cliMode: "ask",
      llmRequest: {
        system: "Be helpful.",
        messages: [{ role: "user", content: "Identify" }],
      },
    });

    expect(result.text).toBe("Final answer");
    expect(generateContentStream).toHaveBeenCalledTimes(9);
    expect(generateContentStream.mock.calls[8]?.[0]?.config.tools).toBeUndefined();
    expect(generateContentStream.mock.calls[8]?.[0]?.config.toolConfig).toEqual({
      functionCallingConfig: { mode: "NONE" },
    });
    const finalContents = generateContentStream.mock.calls[8]?.[0]?.contents;
    expect(JSON.stringify(finalContents)).not.toContain("functionCall");
    expect(JSON.stringify(finalContents)).toContain("unsupported tool: unknown_tool");
  });

  it("reports the call trace when no answer is produced", async () => {
    let request = 0;
    generateContentStream.mockImplementation(async () => {
      request += 1;
      const part =
        request <= 8
          ? { functionCall: { name: "list_files", args: { path: "src" } } }
          : { text: "internal reasoning", thought: true };
      return (async function* () {
        yield { candidates: [{ content: { parts: [part] }, finishReason: "STOP" }] };
      })();
    });

    const provider = new GeminiLlmProvider({
      get: vi.fn().mockResolvedValue("test-key"),
    } as never);
    await expect(
      provider.run({
        transcriptText: "Identify",
        userMessage: "Identify",
        workspaceRoot: process.cwd(),
        cliMode: "ask",
        llmRequest: {
          system: "Be helpful.",
          messages: [{ role: "user", content: "Identify" }],
        },
      }),
    ).rejects.toThrow(
      /Calls: r1:list_files\("src"\).*r8:list_files\("src"\).*Final: STOP; thought/,
    );
  });

  it("maps deterministic generation controls into Gemini config", () => {
    expect(
      geminiGenerationControls({
        generationSeed: 42,
        generationTemperature: 0,
      }),
    ).toEqual({ seed: 42, temperature: 0 });
    expect(geminiGenerationControls({})).toEqual({});
  });
});
