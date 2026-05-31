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

  it("preserves local selection and thread scroll on idle tree refresh", () => {
    const source = readFileSync(resolve(__dirname, "conversationPanel.ts"), "utf8");
    expect(source).toContain("preserveLocalSelection?: boolean;");
    expect(source).toContain("!preserveLocalSelection");
    expect(source).toMatch(
      /msg\.type === "refresh"[\s\S]*preserveLocalSelection: true[\s\S]*preserveThreadScroll: true/,
    );
    expect(source).toMatch(
      /async refreshConversationTree[\s\S]*preserveLocalSelection: true[\s\S]*preserveThreadScroll: true/,
    );
  });

  it("preserves thread scroll after note/title/model metadata updates", () => {
    const source = readFileSync(resolve(__dirname, "conversationPanel.ts"), "utf8");
    expect(source).toMatch(
      /async function addNoteToEvent[\s\S]*preserveThreadScroll: true/,
    );
    expect(source).toMatch(
      /msg\.type === "editNote"[\s\S]*preserveThreadScroll: true/,
    );
    expect(source).toMatch(
      /async function mergeNotesIntoCachedTreeAndPost[\s\S]*preserveThreadScroll: true/,
    );
    expect(source).toMatch(
      /async function editMessageTitleForEvent[\s\S]*preserveThreadScroll: true/,
    );
    expect(source).toMatch(
      /function scheduleRefreshCachedAgentModels[\s\S]*preserveThreadScroll: true/,
    );
  });
});
