import { describe, expect, it } from "vitest";
import { formatToolCallTraceRow } from "./cursorAgentTraceRows";

describe("formatToolCallTraceRow", () => {
  it("formats readToolCall started with header and line range", () => {
    const row = formatToolCallTraceRow("started", {
      readToolCall: { args: { path: "path/to/python_script.py", header: "chunk", startLine: 1, endLine: 30 } },
    });
    expect(row).toEqual({
      colcoor_row: "read",
      text: "Read [chunk] path/to/python_script.py (lines 1:30)",
    });
  });

  it("formats readToolCall with path only", () => {
    expect(
      formatToolCallTraceRow("started", { readToolCall: { args: { path: "README.md" } } }),
    ).toEqual({ colcoor_row: "read", text: "Read README.md" });
  });

  it("formats editToolCall completed with diffString", () => {
    const row = formatToolCallTraceRow("completed", {
      editToolCall: {
        result: { success: { diffString: "--- a\n+++ b\n+line" } },
      },
    });
    expect(row).toEqual({ colcoor_row: "edit_diff", diff: "--- a\n+++ b\n+line" });
  });

  it("includes path on editToolCall completed when args.path is present", () => {
    const row = formatToolCallTraceRow("completed", {
      editToolCall: {
        args: { path: "src/lib.py" },
        result: { success: { diffString: "--- a\n+++ b" } },
      },
    });
    expect(row).toEqual({
      colcoor_row: "edit_diff",
      diff: "--- a\n+++ b",
      path: "src/lib.py",
    });
  });

  it("formats shellToolCall started", () => {
    const row = formatToolCallTraceRow("started", {
      shellToolCall: { args: { command: "python3 -m unittest x -v", description: "Run unittest from tmp directory" } },
    });
    expect(row).toEqual({
      colcoor_row: "shell_start",
      text: "Run unittest from tmp directory\ncommand: python3 -m unittest x -v",
    });
  });

  it("formats shellToolCall completed with rejection", () => {
    const row = formatToolCallTraceRow("completed", {
      shellToolCall: {
        args: { command: "rm -rf /" },
        result: { rejected: { reason: "blocked" } },
      },
    });
    expect(row?.colcoor_row).toBe("shell_done");
    expect(String((row as { text: string }).text)).toContain("command rejected");
    expect(String((row as { text: string }).text)).toContain("rm -rf /");
  });

  it("returns null for unrelated tools", () => {
    expect(formatToolCallTraceRow("started", { writeToolCall: { args: { path: "f" } } })).toBeNull();
    expect(formatToolCallTraceRow("completed", { readToolCall: { args: { path: "x" } } })).toBeNull();
  });
});
