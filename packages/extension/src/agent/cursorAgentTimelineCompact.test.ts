import { describe, expect, it } from "vitest";
import { compactToolCallForTimeline } from "./cursorAgentTimelineCompact";

function tc(
  subtype: string,
  toolCall: Record<string, unknown>,
): Record<string, unknown> {
  return { type: "tool_call", subtype, call_id: "id", tool_call: toolCall };
}

describe("compactToolCallForTimeline", () => {
  it("formats read completed with path and line range", () => {
    const o = tc("completed", {
      readToolCall: {
        args: { path: "path/to/python_script.py", startLine: 1, endLine: 30 },
        result: { success: { totalLines: 99 } },
      },
    });
    const c = compactToolCallForTimeline(o);
    expect(c).toMatchObject({ colcoor_compact: true, kind: "read" });
    expect((c as { summary: string }).summary).toBe("Read path/to/python_script.py (lines 1:30)");
  });

  it("includes optional header after path", () => {
    const o = tc("completed", {
      readToolCall: {
        args: { path: "/proj/a.py", header: "Header line", startLine: 2, endLine: 5 },
        result: { success: {} },
      },
    });
    expect((compactToolCallForTimeline(o) as { summary: string }).summary).toBe(
      "Read /proj/a.py — Header line (lines 2:5)",
    );
  });

  it("keeps edit completed diffString only", () => {
    const o = tc("completed", {
      editToolCall: {
        args: { path: "src/x.ts" },
        result: { success: { diffString: "@@ -1 +1 @@\n-old\n+new" } },
      },
    });
    const c = compactToolCallForTimeline(o);
    expect(c).toMatchObject({
      colcoor_compact: true,
      kind: "edit_diff",
      summary: "Edit src/x.ts",
    });
    expect((c as { diff: string }).diff).toContain("-old");
  });

  it("formats shell started with description and command", () => {
    const o = tc("started", {
      shellToolCall: {
        args: {
          description: "Run unittest from tmp directory",
          command: "python3 -m unittest -v",
        },
      },
    });
    const c = compactToolCallForTimeline(o);
    expect((c as { summary: string }).summary).toBe(
      "Run unittest from tmp directory\ncommand: python3 -m unittest -v",
    );
  });

  it("formats shell completed failure", () => {
    const o = tc("completed", {
      shellToolCall: {
        args: { command: "rm -rf /" },
        result: { failure: { stderr: "nope", exitCode: 1 } },
      },
    });
    const c = compactToolCallForTimeline(o);
    expect((c as { summary: string }).summary).toContain("command rejected - rm -rf /");
  });

  it("drops read started and unknown tools", () => {
    expect(
      compactToolCallForTimeline(
        tc("started", { readToolCall: { args: { path: "a.txt" } } }),
      ),
    ).toBeNull();
    expect(compactToolCallForTimeline(tc("completed", { writeToolCall: { args: { path: "x" } } }))).toBeNull();
  });
});
