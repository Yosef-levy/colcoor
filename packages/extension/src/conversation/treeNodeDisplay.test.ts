import { describe, expect, it } from "vitest";

import {
  TREE_EVENT_DISPLAY_TITLE_MAX,
  TREE_EVENT_SNIPPET_MAX,
  treeEventDisplayTitleFromContentJson,
  treeEventSnippet,
} from "./treeNodeDisplay";

describe("treeEventSnippet", () => {
  it("collapses whitespace and trims", () => {
    expect(treeEventSnippet("  a  \n\tb  ")).toBe("a b");
  });

  it("returns (empty) for null or whitespace-only", () => {
    expect(treeEventSnippet(null)).toBe("(empty)");
    expect(treeEventSnippet("  \r\n  ")).toBe("(empty)");
  });

  it(`truncates at ${TREE_EVENT_SNIPPET_MAX} with ellipsis`, () => {
    const long = "x".repeat(TREE_EVENT_SNIPPET_MAX + 5);
    const out = treeEventSnippet(long);
    expect(out).toHaveLength(TREE_EVENT_SNIPPET_MAX + 1);
    expect(out.endsWith("…")).toBe(true);
  });

  it("honours custom max length", () => {
    expect(treeEventSnippet("abcdefghij", 5)).toBe("abcde…");
  });
});

describe("treeEventDisplayTitleFromContentJson", () => {
  it("reads title, message_title, or display_title", () => {
    expect(treeEventDisplayTitleFromContentJson({ title: "  T1  " })).toBe("T1");
    expect(treeEventDisplayTitleFromContentJson({ message_title: "T2" })).toBe("T2");
    expect(treeEventDisplayTitleFromContentJson({ display_title: "T3" })).toBe("T3");
  });

  it("prefers title over other keys", () => {
    expect(
      treeEventDisplayTitleFromContentJson({
        title: "first",
        message_title: "second",
      }),
    ).toBe("first");
  });

  it("returns empty for missing or non-string fields", () => {
    expect(treeEventDisplayTitleFromContentJson(null)).toBe("");
    expect(treeEventDisplayTitleFromContentJson({ title: 1 })).toBe("");
    expect(treeEventDisplayTitleFromContentJson({ title: "  " })).toBe("");
  });

  it(`truncates at ${TREE_EVENT_DISPLAY_TITLE_MAX}`, () => {
    const long = "y".repeat(TREE_EVENT_DISPLAY_TITLE_MAX + 3);
    const out = treeEventDisplayTitleFromContentJson({ title: long });
    expect(out).toHaveLength(TREE_EVENT_DISPLAY_TITLE_MAX + 1);
    expect(out.endsWith("…")).toBe(true);
  });
});
