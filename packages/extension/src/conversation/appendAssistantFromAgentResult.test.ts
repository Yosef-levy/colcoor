import { describe, expect, it, vi } from "vitest";
import type { ColcoorApiClient } from "../api/client";
import { appendAssistantFromAgentResult } from "./appendAssistantFromAgentResult";

function mockApi(appendEvent: ReturnType<typeof vi.fn>): ColcoorApiClient {
  return { appendEvent } as unknown as ColcoorApiClient;
}

describe("appendAssistantFromAgentResult", () => {
  it("does not call append when cancelled and normalized assistant text is empty", async () => {
    const appendEvent = vi.fn();
    const out = await appendAssistantFromAgentResult(mockApi(appendEvent), "conv", "userEv", {
      text: "  \n\t  ",
      stub: "none",
      cancelled: true,
    });
    expect(appendEvent).not.toHaveBeenCalled();
    expect(out).toEqual({ userEventId: "userEv", cancelled: true });
  });

  it("appends CRLF-normalized partial assistant when cancelled with non-empty text", async () => {
    const appendEvent = vi.fn().mockResolvedValue({ id: "asst-1" });
    const out = await appendAssistantFromAgentResult(mockApi(appendEvent), "conv", "userEv", {
      text: "\r\npartial\r\n",
      stub: "explicit",
      cancelled: true,
      cursorCliTimeline: [{ t: "x" }],
    });
    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(appendEvent).toHaveBeenCalledWith("conv", {
      kind: "assistant_output",
      parent_event_id: "userEv",
      content: "partial",
      author: "cursor_agent",
      private_branch: false,
      content_json: {
        colcoor_agent_trace: {
          version: 3,
          entries: [{ t: "x" }],
        },
      },
    });
    expect(out).toEqual({
      userEventId: "userEv",
      assistantEventId: "asst-1",
      assistantText: "partial",
      assistantStub: "explicit",
      cancelled: true,
    });
  });

  it("appends full assistant text on normal completion without trimming", async () => {
    const appendEvent = vi.fn().mockResolvedValue({ id: "asst-2" });
    const out = await appendAssistantFromAgentResult(mockApi(appendEvent), "c", "u", {
      text: "  keep spaces  ",
      stub: "none",
    });
    expect(appendEvent).toHaveBeenCalledWith("c", expect.objectContaining({ content: "  keep spaces  " }));
    expect(out.assistantEventId).toBe("asst-2");
    expect(out.assistantText).toBe("  keep spaces  ");
    expect(out.cancelled).toBeUndefined();
  });

  it("passes undefined content_json when there is no CLI timeline", async () => {
    const appendEvent = vi.fn().mockResolvedValue({ id: "a" });
    await appendAssistantFromAgentResult(mockApi(appendEvent), "c", "u", { text: "hi", stub: "none" });
    expect(appendEvent.mock.calls[0][1].content_json).toBeUndefined();
  });

  it("persists structured assistant display parts with the CLI trace", async () => {
    const appendEvent = vi.fn().mockResolvedValue({ id: "asst-3" });
    await appendAssistantFromAgentResult(mockApi(appendEvent), "conv", "userEv", {
      text: "preface\n\nanswer",
      stub: "none",
      cursorCliTimeline: [{ colcoor_row: "read", text: "Read README.md" }],
      cursorCliDisplayParts: [
        { kind: "assistant", text: "preface" },
        { kind: "activity", entries: [{ colcoor_row: "read", text: "Read README.md" }] },
        { kind: "assistant", text: "answer" },
      ],
    });
    expect(appendEvent.mock.calls[0][1].content_json).toEqual({
      colcoor_agent_trace: {
        version: 3,
        entries: [{ colcoor_row: "read", text: "Read README.md" }],
        display_parts: [
          { kind: "assistant", text: "preface" },
          { kind: "activity", entries: [{ colcoor_row: "read", text: "Read README.md" }] },
          { kind: "assistant", text: "answer" },
        ],
      },
    });
  });

  it("merges colcoor_provider_usage from run result and turn context", async () => {
    const appendEvent = vi.fn().mockResolvedValue({ id: "asst-4" });
    await appendAssistantFromAgentResult(
      mockApi(appendEvent),
      "conv",
      "userEv",
      {
        text: "answer",
        stub: "none",
        providerUsage: {
          version: 1,
          provider: "anthropic",
          backend: "claude_agent_sdk",
          mode: "agent",
          model: "claude-sonnet-4-5",
          tokens: { input: 10, output: 20 },
          captured_at: "2026-07-09T12:00:00.000Z",
        },
      },
      undefined,
      { cliMode: "plan", agentSession: { kind: "resume", sessionId: "sess-1" }, promptCacheTtl: "1h" },
    );
    expect(appendEvent.mock.calls[0][1].content_json?.colcoor_provider_usage).toMatchObject({
      mode: "plan",
      continuation: "resume",
      prompt_cache_ttl: "1h",
      tokens: { input: 10, output: 20 },
    });
  });
});
