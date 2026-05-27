import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { TREE_NODE_CONTEXT_MENU_ENTRIES } from "./treeNodeContextMenu";

describe("TREE_NODE_CONTEXT_MENU_ENTRIES", () => {
  it("puts continue from here first", () => {
    expect(TREE_NODE_CONTEXT_MENU_ENTRIES[0]).toMatchObject({
      commandId: "colcoor.continueFromHere",
      quickPickLabel: "Continue from here",
    });
  });

  it("orders reference note after reference message in side chat", () => {
    const ids = TREE_NODE_CONTEXT_MENU_ENTRIES.map((e) => e.commandId);
    const iMsg = ids.indexOf("colcoor.referenceSelectedMessageInSideChat");
    const iNote = ids.indexOf("colcoor.referenceSelectedNoteInSideChat");
    expect(iMsg).toBeGreaterThan(-1);
    expect(iNote).toBeGreaterThan(iMsg);
  });

  it("lists each command at most once", () => {
    const ids = TREE_NODE_CONTEXT_MENU_ENTRIES.map((e) => e.commandId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("registers every command in package.json", () => {
    const raw = readFileSync(resolve(__dirname, "../../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { commands?: Array<{ command?: string }> } };
    const cmds = new Set(pkg.contributes?.commands?.map((c) => c.command) ?? []);
    for (const e of TREE_NODE_CONTEXT_MENU_ENTRIES) {
      expect(cmds.has(e.commandId), e.commandId).toBe(true);
    }
  });

  it("uses non-empty quick-pick labels", () => {
    for (const e of TREE_NODE_CONTEXT_MENU_ENTRIES) {
      expect(e.quickPickLabel.trim().length).toBeGreaterThan(0);
    }
  });
});
