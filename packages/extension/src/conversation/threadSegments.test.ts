import { describe, expect, it } from "vitest";
import { enrichTraceEntriesForWebview, extractAgentTraceEntries } from "./threadSegments";

describe("extractAgentTraceEntries", () => {
  it("returns entries from colcoor_agent_trace", () => {
    const entries = extractAgentTraceEntries({
      colcoor_agent_trace: { version: 2, entries: [{ colcoor_row: "read", text: "Read x" }] },
    });
    expect(entries).toEqual([{ colcoor_row: "read", text: "Read x" }]);
  });

  it("returns undefined when missing or empty", () => {
    expect(extractAgentTraceEntries(undefined)).toBeUndefined();
    expect(extractAgentTraceEntries({})).toBeUndefined();
    expect(extractAgentTraceEntries({ colcoor_agent_trace: { version: 1, entries: [] } })).toBeUndefined();
  });
});

describe("enrichTraceEntriesForWebview", () => {
  it("adds counts and diff_html for edit_diff rows", () => {
    const diff = ["--- a/x", "+++ b/x", "@@ -1 +1 @@", "-a", "+b"].join("\n");
    const [row] = enrichTraceEntriesForWebview([
      { colcoor_row: "edit_diff", diff, path: "x" },
    ]) as { colcoor_row: string; diff: string; diff_added: number; diff_removed: number; diff_html: string }[];
    expect(row.diff_added).toBe(1);
    expect(row.diff_removed).toBe(1);
    expect(row.diff_html).toContain("diff-add");
    expect(row.diff_html).toContain("diff-del");
  });

  it("passes through non-edit entries unchanged", () => {
    const entries = [{ colcoor_row: "read", text: "Read f" }];
    expect(enrichTraceEntriesForWebview(entries)).toEqual(entries);
  });
});
