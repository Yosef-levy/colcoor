import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: { getConfiguration: () => ({ get: () => undefined }) },
}));

import { toGeminiContents } from "./geminiLlmProvider";

describe("Gemini request mapping", () => {
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
});
