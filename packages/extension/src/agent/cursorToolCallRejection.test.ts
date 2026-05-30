import { describe, expect, it } from "vitest";
import {
  continuationPromptAfterAllowlist,
  continuationPromptAfterRun,
  continuationPromptAfterSkip,
  domainFromWebFetchUrl,
  enrichToolCallRejection,
  parseToolCallRejection,
  parseToolCallStarted,
  shellAllowToken,
  shellCommandBaseForAllowlist,
  shellCommandBasesForAllowlist,
  toolCallSupportsRunOnce,
} from "./cursorToolCallRejection";

describe("parseToolCallRejection", () => {
  it("detects completed shell tool_call with rejected result and args", () => {
    const rejection = parseToolCallRejection({
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
    expect(rejection).toMatchObject({
      kind: "shell",
      sessionId: "sess-1",
      title: "Run frontend production build",
      allowTokens: ["Shell(npm)"],
      shell: {
        command: "npm run build",
        workingDirectory: "/tmp/frontend",
        description: "Run frontend production build",
        simpleCommands: ["npm"],
      },
    });
    expect(toolCallSupportsRunOnce(rejection!)).toBe(true);
  });

  it("detects rejection when Cursor CLI omits args on completed event", () => {
    const rejection = parseToolCallRejection({
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
    expect(rejection).toMatchObject({
      kind: "shell",
      sessionId: "193223e2-1c2c-4c45-b37c-60f17119e9b9",
      shell: {
        command: "echo Hi",
        workingDirectory: "/home/levy/work/conversation_orchestrator",
      },
    });
  });

  it("detects rejected readToolCall", () => {
    const rejection = parseToolCallRejection({
      type: "tool_call",
      subtype: "completed",
      session_id: "sess-2",
      tool_call: {
        readToolCall: {
          args: { path: "README.md" },
          result: { rejected: { path: "README.md", reason: "" } },
        },
      },
    });
    expect(rejection).toEqual({
      kind: "read",
      sessionId: "sess-2",
      callId: undefined,
      title: "Read file needs approval",
      detail: "README.md",
      allowTokens: ["Read(README.md)"],
    });
    expect(toolCallSupportsRunOnce(rejection!)).toBe(false);
  });

  it("detects rejected editToolCall as write", () => {
    const rejection = parseToolCallRejection({
      type: "tool_call",
      subtype: "completed",
      tool_call: {
        editToolCall: {
          args: { path: "src/app.ts" },
          result: { rejected: { path: "src/app.ts" } },
        },
      },
    });
    expect(rejection).toMatchObject({
      kind: "write",
      detail: "src/app.ts",
      allowTokens: ["Write(src/app.ts)"],
    });
  });

  it("detects rejected webFetchToolCall", () => {
    const rejection = parseToolCallRejection({
      type: "tool_call",
      subtype: "completed",
      tool_call: {
        webFetchToolCall: {
          args: { url: "https://example.com/docs" },
          result: { rejected: { url: "https://example.com/docs" } },
        },
      },
    });
    expect(rejection).toMatchObject({
      kind: "webFetch",
      detail: "https://example.com/docs",
      allowTokens: ["WebFetch(example.com)"],
    });
  });

  it("detects rejected mcpToolCall", () => {
    const rejection = parseToolCallRejection({
      type: "tool_call",
      subtype: "completed",
      tool_call: {
        mcpToolCall: {
          args: { server: "browser", tool: "navigate" },
          result: { rejected: { server: "browser", tool: "navigate" } },
        },
      },
    });
    expect(rejection).toMatchObject({
      kind: "mcp",
      detail: "browser:navigate",
      allowTokens: ["Mcp(browser:navigate)"],
    });
  });

  it("returns null for successful shell tool_call", () => {
    expect(
      parseToolCallRejection({
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

describe("parseToolCallStarted", () => {
  it("captures simpleCommands from started shell tool_call", () => {
    expect(
      parseToolCallStarted({
        type: "tool_call",
        subtype: "started",
        call_id: "tool-1",
        tool_call: {
          shellToolCall: {
            args: {
              command: 'git commit -m "$(cat <<\'EOF\'\\ntest\\nEOF\\n)"',
              simpleCommands: ["git", "cat"],
            },
          },
        },
      }),
    ).toMatchObject({
      callId: "tool-1",
      kind: "shell",
      shell: {
        command: 'git commit -m "$(cat <<\'EOF\'\\ntest\\nEOF\\n)"',
        simpleCommands: ["git", "cat"],
      },
    });
  });

  it("captures read path from started readToolCall", () => {
    expect(
      parseToolCallStarted({
        type: "tool_call",
        subtype: "started",
        call_id: "tool-2",
        tool_call: {
          readToolCall: { args: { path: "secrets.env" } },
        },
      }),
    ).toMatchObject({
      callId: "tool-2",
      kind: "read",
      readPath: "secrets.env",
      allowTokens: ["Read(secrets.env)"],
    });
  });
});

describe("enrichToolCallRejection", () => {
  it("fills simpleCommands from started metadata when completed omits args", () => {
    const rejection = parseToolCallRejection({
      type: "tool_call",
      subtype: "completed",
      call_id: "tool-1",
      session_id: "sess-1",
      tool_call: {
        shellToolCall: {
          result: {
            rejected: {
              command: 'git commit -m "$(cat <<\'EOF\'\\ntest\\nEOF\\n)"',
              workingDirectory: "/tmp/repo",
            },
          },
        },
      },
    });
    expect(
      enrichToolCallRejection(rejection!, {
        kind: "shell",
        shell: {
          command: 'git commit -m "$(cat <<\'EOF\'\\ntest\\nEOF\\n)"',
          simpleCommands: ["git", "cat"],
        },
      }),
    ).toMatchObject({
      sessionId: "sess-1",
      allowTokens: ["Shell(git)", "Shell(cat)"],
      shell: {
        command: 'git commit -m "$(cat <<\'EOF\'\\ntest\\nEOF\\n)"',
        workingDirectory: "/tmp/repo",
        simpleCommands: ["git", "cat"],
      },
    });
  });
});

describe("shellCommandBasesForAllowlist", () => {
  it("returns all unique simpleCommands", () => {
    expect(
      shellCommandBasesForAllowlist('git commit -m "$(cat <<EOF"', ["git", "cat", "git"]),
    ).toEqual(["git", "cat"]);
  });

  it("falls back to first command token", () => {
    expect(shellCommandBasesForAllowlist("git status", undefined)).toEqual(["git"]);
  });
});

describe("shellCommandBaseForAllowlist", () => {
  it("prefers first simpleCommand from Cursor CLI", () => {
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

describe("domainFromWebFetchUrl", () => {
  it("extracts hostname from https URL", () => {
    expect(domainFromWebFetchUrl("https://docs.example.com/page")).toBe("docs.example.com");
  });
});

describe("continuation prompts", () => {
  const rejection = {
    kind: "shell" as const,
    title: "Build frontend",
    detail: "npm run build",
    allowTokens: ["Shell(npm)"],
    shell: {
      command: "npm run build",
      description: "Build frontend",
      workingDirectory: "/tmp",
    },
  };

  it("builds allowlist continuation", () => {
    expect(continuationPromptAfterAllowlist(rejection)).toContain("Shell(npm)");
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
