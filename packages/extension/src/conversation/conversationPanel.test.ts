import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("conversationPanel star rendering", () => {
  it("preserves thread scroll after toggling a star", () => {
    const source = readFileSync(resolve(__dirname, "conversationPanel.ts"), "utf8");
    const match = source.match(
      /async function toggleStarForEvent[\s\S]*?\n  async function toggleStarSelectedMessage/,
    );
    expect(match?.[0]).toContain(
      "postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });",
    );
  });
});
