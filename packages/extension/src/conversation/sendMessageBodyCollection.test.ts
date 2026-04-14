import { describe, expect, it } from "vitest";

import { collectSendMessageBody, type CollectSendMessageBodyDeps } from "./sendMessageBodyCollection";

function deps(partial: Partial<CollectSendMessageBodyDeps> & Pick<CollectSendMessageBodyDeps, "pickMode">) {
  return {
    promptSingleLine: async () => {
      throw new Error("unexpected promptSingleLine");
    },
    getMultilineFromEditor: async () => {
      throw new Error("unexpected getMultilineFromEditor");
    },
    ...partial,
  } satisfies CollectSendMessageBodyDeps;
}

describe("collectSendMessageBody", () => {
  it("normalizes single-line input", async () => {
    expect(
      await collectSendMessageBody(
        deps({
          pickMode: async () => "single_line",
          promptSingleLine: async () => "  hi\r\n",
        }),
      ),
    ).toBe("hi");
  });

  it("returns empty when single-line prompt is dismissed with Esc", async () => {
    expect(
      await collectSendMessageBody(
        deps({
          pickMode: async () => "single_line",
          promptSingleLine: async () => undefined,
        }),
      ),
    ).toBe("");
  });

  it("normalizes multiline editor text", async () => {
    expect(
      await collectSendMessageBody(
        deps({
          pickMode: async () => "multiline_editor",
          getMultilineFromEditor: async () => "  a\nb  ",
        }),
      ),
    ).toBe("a\nb");
  });
});
