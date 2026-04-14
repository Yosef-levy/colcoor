import { describe, expect, it, vi, beforeEach } from "vitest";

const getConfiguration = vi.hoisted(() =>
  vi.fn(() => ({
    get: (key: string, defaultValue?: unknown) =>
      key === "includeWorkspaceHintsInAgentPrompt" ? false : defaultValue,
  })),
);

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration,
    asRelativePath: (): string => "",
  },
  window: { activeTextEditor: undefined },
}));

import type { AgentRunner } from "../agent/agentRunner";
import type { ColcoorApiClient, GraphEventNode } from "../api/client";
import { runResendAssistant } from "./resendAssistant";

function ev(
  p: Pick<GraphEventNode, "id" | "parent_event_id" | "kind" | "content_text" | "created_at">,
): GraphEventNode {
  return {
    ...p,
    conversation_id: "conv1",
    actor_type: p.kind === "assistant_output" ? "assistant" : "user",
    actor_user_id: null,
    visible_to: null,
    updated_at: p.created_at,
  };
}

/** Linear root → assistant → user chain for resend tests. */
function defaultTree(userContent: string): GraphEventNode[] {
  return [
    ev({
      id: "root",
      parent_event_id: null,
      kind: "user_input",
      content_text: "",
      created_at: "2020-01-01T00:00:00Z",
    }),
    ev({
      id: "asst1",
      parent_event_id: "root",
      kind: "assistant_output",
      content_text: "prev",
      created_at: "2020-01-02T00:00:00Z",
    }),
    ev({
      id: "user1",
      parent_event_id: "asst1",
      kind: "user_input",
      content_text: userContent,
      created_at: "2020-01-03T00:00:00Z",
    }),
  ];
}

describe("runResendAssistant", () => {
  beforeEach(() => {
    getConfiguration.mockClear();
    getConfiguration.mockImplementation(() => ({
      get: (key: string, defaultValue?: unknown) =>
        key === "includeWorkspaceHintsInAgentPrompt" ? false : defaultValue,
    }));
  });

  it("throws when the tree is empty", async () => {
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: [] }),
      listNotes: vi.fn(),
    } as unknown as ColcoorApiClient;
    await expect(
      runResendAssistant(api, {} as AgentRunner, "conv1", null, "user1", ""),
    ).rejects.toThrow("conversation has no events");
  });

  it("throws when userEventId is blank after normalization", async () => {
    const getTree = vi.fn();
    const api = {
      getTree,
      listNotes: vi.fn(),
    } as unknown as ColcoorApiClient;
    await expect(
      runResendAssistant(api, {} as AgentRunner, "conv1", null, "  \r\n\t  ", ""),
    ).rejects.toThrow("event not found");
    expect(getTree).not.toHaveBeenCalled();
  });

  it("throws when the target id is missing", async () => {
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: defaultTree("hi") }),
      listNotes: vi.fn().mockResolvedValue([]),
    } as unknown as ColcoorApiClient;
    await expect(
      runResendAssistant(api, {} as AgentRunner, "conv1", null, "missing", ""),
    ).rejects.toThrow("event not found");
  });

  it("throws when the target is not user_input", async () => {
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: defaultTree("hi") }),
      listNotes: vi.fn().mockResolvedValue([]),
    } as unknown as ColcoorApiClient;
    await expect(
      runResendAssistant(api, {} as AgentRunner, "conv1", null, "asst1", ""),
    ).rejects.toThrow("Resend only applies to a user message");
  });

  it("throws when the user message body is empty after normalization", async () => {
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: defaultTree("  \r\n\t  ") }),
      listNotes: vi.fn().mockResolvedValue([]),
    } as unknown as ColcoorApiClient;
    await expect(
      runResendAssistant(api, {} as AgentRunner, "conv1", null, "user1", ""),
    ).rejects.toThrow("cannot resend an empty user message");
  });

  it("passes CRLF-normalized user text to the agent", async () => {
    const run = vi.fn().mockResolvedValue({ text: "new", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValue({ id: "asst-new" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: defaultTree("a\rb") }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runResendAssistant(api, agent, "conv1", "T", "user1", "/tmp/ws");

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].userMessage).toBe("a\nb");
    expect(appendEvent).toHaveBeenCalledWith(
      "conv1",
      expect.objectContaining({
        kind: "assistant_output",
        parent_event_id: "user1",
        content: "new",
      }),
    );
  });

  it("normalizes whitespace and CRLF on userEventId before lookup and append", async () => {
    const run = vi.fn().mockResolvedValue({ text: "new", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValue({ id: "asst-new" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: defaultTree("body") }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runResendAssistant(api, agent, "conv1", "T", "  user1\r\n", "/tmp/ws");

    expect(appendEvent).toHaveBeenCalledWith(
      "conv1",
      expect.objectContaining({ parent_event_id: "user1" }),
    );
  });

  it("returns cancelled without append when the agent run aborts", async () => {
    const run = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn();
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: defaultTree("x") }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    const out = await runResendAssistant(api, agent, "conv1", null, "  user1\r\n", "");
    expect(out).toEqual({ userEventId: "user1", cancelled: true });
    expect(appendEvent).not.toHaveBeenCalled();
  });

  it("forwards signal and onAssistantTextDelta to the agent", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: defaultTree("q") }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent: vi.fn().mockResolvedValue({ id: "a" }),
    } as unknown as ColcoorApiClient;
    const ac = new AbortController();
    const onAssistantTextDelta = vi.fn();
    await runResendAssistant(api, agent, "conv1", null, "user1", "", {
      signal: ac.signal,
      onAssistantTextDelta,
    });
    expect(run.mock.calls[0][0].signal).toBe(ac.signal);
    expect(run.mock.calls[0][0].onTextDelta).toBe(onAssistantTextDelta);
  });
});
