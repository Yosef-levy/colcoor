import { describe, expect, it } from "vitest";
import {
  MAX_WORKSPACE_CONTEXT_CHARS,
  buildWorkspaceContextBlock,
} from "./workspaceContextAppendix";

describe("buildWorkspaceContextBlock", () => {
  it("returns empty string when there is no substantive content", () => {
    expect(buildWorkspaceContextBlock({})).toBe("");
    expect(buildWorkspaceContextBlock({ activeFileRelative: "  " })).toBe("");
  });

  it("includes active file, selection, and diff sections", () => {
    const s = buildWorkspaceContextBlock({
      activeFileRelative: "src/a.ts",
      selectionSnippet: "hello",
      gitDiffUnified: "diff --git a/x b/x",
    });
    expect(s).toContain("Active file: src/a.ts");
    expect(s).toContain("Selection:");
    expect(s).toContain("hello");
    expect(s).toContain("git diff");
    expect(s).toContain("diff --git a/x b/x");
  });

  it("truncates when over maxChars", () => {
    const long = "x".repeat(MAX_WORKSPACE_CONTEXT_CHARS + 500);
    const s = buildWorkspaceContextBlock({ gitDiffUnified: long }, MAX_WORKSPACE_CONTEXT_CHARS);
    expect(s.length).toBeLessThanOrEqual(MAX_WORKSPACE_CONTEXT_CHARS + 30);
    expect(s).toContain("… (truncated)");
  });
});
