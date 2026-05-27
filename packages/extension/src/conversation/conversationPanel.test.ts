import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("conversationPanel star rendering", () => {
  it("preserves thread scroll after toggling a star", () => {
    const source = readFileSync(resolve(__dirname, "conversationPanel.ts"), "utf8");
    const start = source.indexOf("async function toggleStarForEvent");
    const end = source.indexOf("async function toggleStarSelectedMessage", start);
    expect(source.slice(start, end)).toContain(
      "postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });",
    );
  });
});
