import { describe, expect, it } from "vitest";
import {
  continuationPromptAfterAllowlist,
  continuationPromptAfterRun,
  continuationPromptAfterSkip,
  parseShellToolCallRejection,
  shellAllowToken,
  shellCommandBaseForAllowlist,
} from "./cursorShellToolCall";

describe("parseShellToolCallRejection", () => {
  it("detects completed shell tool_call with rejected result and args", () => {
    const rejection = parseShellToolCallRejection({
      type: "tool_call",
      subtype: "completed",
      session_id: "sess-1",
      tool_call: {
        shellToolCall: {
          args: {
            command: "npm run build",
            workingDirectory: "/tmp/frontend",
            description: "Run frontend production build",
            simpleCommands: ["npm"],
          },
          result: { rejected: { command: "npm run build", reason: "" } },
        },
      },
    });
    expect(rejection).toEqual({
      command: "npm run build",
      workingDirectory: "/tmp/frontend",
      description: "Run frontend production build",
      sessionId: "sess-1",
      simpleCommands: ["npm"],
    });
  });

  it("detects rejection when Cursor CLI omits args on completed event", () => {
    const rejection = parseShellToolCallRejection({
      type: "tool_call",
      subtype: "completed",
      session_id: "193223e2-1c2c-4c45-b37c-60f17119e9b9",
      tool_call: {
        shellToolCall: {
          result: {
            rejected: {
              command: "echo Hi",
              workingDirectory: "/home/levy/work/conversation_orchestrator",
              reason: "",
              isReadonly: false,
            },
          },
        },
      },
    });
    expect(rejection).toEqual({
      command: "echo Hi",
      workingDirectory: "/home/levy/work/conversation_orchestrator",
      sessionId: "193223e2-1c2c-4c45-b37c-60f17119e9b9",
    });
  });

  it("returns null for successful shell tool_call", () => {
    expect(
      parseShellToolCallRejection({
        type: "tool_call",
        subtype: "completed",
        tool_call: {
          shellToolCall: {
            args: { command: "ls" },
            result: { success: { exitCode: 0 } },
          },
        },
      }),
    ).toBeNull();
  });
});

describe("shellCommandBaseForAllowlist", () => {
  it("prefers simpleCommands from Cursor CLI", () => {
    expect(shellCommandBaseForAllowlist("cd /tmp && npm run build", ["npm"])).toBe("npm");
  });

  it("falls back to first command token", () => {
    expect(shellCommandBaseForAllowlist("git status", undefined)).toBe("git");
  });
});

describe("shellAllowToken", () => {
  it("formats Cursor CLI permission token", () => {
    expect(shellAllowToken("npm")).toBe("Shell(npm)");
  });
});

describe("continuation prompts", () => {
  const rejection = {
    command: "npm run build",
    description: "Build frontend",
    workingDirectory: "/tmp",
  };

  it("builds allowlist continuation", () => {
    expect(continuationPromptAfterAllowlist(rejection)).toContain("allowlist");
    expect(continuationPromptAfterAllowlist(rejection)).toContain("npm run build");
  });

  it("builds run continuation with output", () => {
    const text = continuationPromptAfterRun(rejection, {
      exitCode: 0,
      stdout: "built ok",
      stderr: "",
    });
    expect(text).toContain("Exit code: 0");
    expect(text).toContain("built ok");
  });

  it("builds skip continuation without retrying the command", () => {
    const text = continuationPromptAfterSkip(rejection);
    expect(text).toContain("declined");
    expect(text).toContain("npm run build");
    expect(text).toContain("Do not retry");
  });
});
