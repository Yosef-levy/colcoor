import { describe, expect, it } from "vitest";

import {
  collectOptionalFirstMessage,
  type CollectOptionalFirstMessageDeps,
} from "./optionalFirstMessageCollection";

function deps(partial: Partial<CollectOptionalFirstMessageDeps> & Pick<CollectOptionalFirstMessageDeps, "pickMode">) {
  return {
    promptSingleLine: async () => {
      throw new Error("unexpected promptSingleLine");
    },
    getMultilineFromEditor: async () => {
      throw new Error("unexpected getMultilineFromEditor");
    },
    ...partial,
  } satisfies CollectOptionalFirstMessageDeps;
}

describe("collectOptionalFirstMessage", () => {
  it("returns empty when mode is skip", async () => {
    expect(
      await collectOptionalFirstMessage(
        deps({
          pickMode: async () => "skip",
        }),
      ),
    ).toBe("");
  });

  it("normalizes single-line input", async () => {
    expect(
      await collectOptionalFirstMessage(
        deps({
          pickMode: async () => "single_line",
          promptSingleLine: async () => "  hi\r\n",
        }),
      ),
    ).toBe("hi");
  });

  it("treats Esc on single-line (undefined) as skip", async () => {
    expect(
      await collectOptionalFirstMessage(
        deps({
          pickMode: async () => "single_line",
          promptSingleLine: async () => undefined,
        }),
      ),
    ).toBe("");
  });

  it("normalizes multiline editor text", async () => {
    expect(
      await collectOptionalFirstMessage(
        deps({
          pickMode: async () => "multiline_editor",
          getMultilineFromEditor: async () => "  line1\nline2\r\n  ",
        }),
      ),
    ).toBe("line1\nline2");
  });
});
