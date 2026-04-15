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
import { runColcoorUserTurn } from "./runUserTurn";

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

/** Root user then assistant leaf — `findBranchTip` is the assistant. */
function linearTree(): GraphEventNode[] {
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
      content_text: "prior",
      created_at: "2020-01-02T00:00:00Z",
    }),
  ];
}

describe("runColcoorUserTurn", () => {
  beforeEach(() => {
    getConfiguration.mockClear();
    getConfiguration.mockImplementation(() => ({
      get: (key: string, defaultValue?: unknown) =>
        key === "includeWorkspaceHintsInAgentPrompt" ? false : defaultValue,
    }));
  });

  it("throws when the message is empty after normalization", async () => {
    const api = {} as ColcoorApiClient;
    await expect(
      runColcoorUserTurn(api, {} as AgentRunner, "conv1", null, "  \r\n  ", ""),
    ).rejects.toThrow("message is empty");
  });

  it("throws when the tree is empty", async () => {
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: [] }),
      listNotes: vi.fn(),
    } as unknown as ColcoorApiClient;
    await expect(
      runColcoorUserTurn(api, {} as AgentRunner, "conv1", null, "hi", ""),
    ).rejects.toThrow("conversation has no events");
  });

  it("skips getTree and listNotes when prefetchedGraph is provided", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u-new" }).mockResolvedValueOnce({ id: "a-new" });
    const getTree = vi.fn();
    const listNotes = vi.fn();
    const api = {
      getTree,
      listNotes,
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "hello", "", {
      prefetchedGraph: { events: linearTree(), notes: [] },
    });

    expect(getTree).not.toHaveBeenCalled();
    expect(listNotes).not.toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalled();
  });

  it("throws when replyParentEventId is not in the tree", async () => {
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
    } as unknown as ColcoorApiClient;
    await expect(
      runColcoorUserTurn(api, {} as AgentRunner, "conv1", null, "hi", "", {
        replyParentEventId: "missing",
      }),
    ).rejects.toThrow("reply parent is not in the current tree");
  });

  it("treats empty replyParentEventId like omitted (attach at branch tip)", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u-new" }).mockResolvedValueOnce({ id: "a-new" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "hello", "", { replyParentEventId: "" });

    expect(appendEvent.mock.calls[0][1]).toMatchObject({
      kind: "user_input",
      parent_event_id: "asst1",
      content: "hello",
    });
  });

  it("normalizes whitespace and CRLF on replyParentEventId before lookup", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u-new" }).mockResolvedValueOnce({ id: "a-new" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "hello", "", {
      replyParentEventId: "  root\r\n",
    });

    expect(appendEvent.mock.calls[0][1].parent_event_id).toBe("root");
  });

  it("treats whitespace-only replyParentEventId like omitted (branch tip)", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u-new" }).mockResolvedValueOnce({ id: "a-new" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "hello", "", {
      replyParentEventId: "  \r\n\t  ",
    });

    expect(appendEvent.mock.calls[0][1].parent_event_id).toBe("asst1");
  });

  it("persists user_input under an explicit reply parent", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u-new" }).mockResolvedValueOnce({ id: "a-new" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "hello", "", { replyParentEventId: "root" });

    expect(appendEvent.mock.calls[0][1]).toMatchObject({
      kind: "user_input",
      parent_event_id: "root",
      private_branch: false,
    });
  });

  it("passes private_branch to appendEvent", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u1" }).mockResolvedValueOnce({ id: "a1" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "x", "", { privateBranch: true });

    expect(appendEvent.mock.calls[0][1].private_branch).toBe(true);
  });

  it("passes normalized checkpoint_label on user_input when checkpointLabel is set", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u1" }).mockResolvedValueOnce({ id: "a1" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "x", "", {
      checkpointLabel: "  my label\r\n",
    });

    expect(appendEvent.mock.calls[0][1]).toMatchObject({
      kind: "user_input",
      checkpoint_label: "my label",
    });
  });

  it("truncates checkpoint_label to 256 chars after normalization", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u1" }).mockResolvedValueOnce({ id: "a1" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    const long = "a".repeat(300);
    await runColcoorUserTurn(api, agent, "conv1", null, "x", "", { checkpointLabel: long });

    const body = appendEvent.mock.calls[0][1] as { checkpoint_label?: string };
    expect(body.checkpoint_label).toHaveLength(256);
    expect(body.checkpoint_label).toBe("a".repeat(256));
  });

  it("omits checkpoint_label when checkpointLabel is empty or whitespace-only", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u1" }).mockResolvedValueOnce({ id: "a1" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "x", "", { checkpointLabel: "  \r\n\t  " });

    const body = appendEvent.mock.calls[0][1] as { checkpoint_label?: string };
    expect(body.checkpoint_label).toBeUndefined();
  });

  it("calls onUserMessagePersisted after user append and before agent.run", async () => {
    const seq: string[] = [];
    const run = vi.fn().mockImplementation(async () => {
      seq.push("run");
      return { text: "ok", stub: "none" as const };
    });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockImplementation(async (_c: string, body: { kind: string }) => {
      seq.push(`append:${body.kind}`);
      return body.kind === "user_input" ? { id: "u-new" } : { id: "a-new" };
    });
    const onUserMessagePersisted = vi.fn().mockImplementation(async () => {
      seq.push("persisted");
    });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "m", "", { onUserMessagePersisted });

    expect(seq).toEqual(["append:user_input", "persisted", "run", "append:assistant_output"]);
    expect(onUserMessagePersisted).toHaveBeenCalledWith({ userEventId: "u-new" });
  });

  it("normalizes CRLF in persisted content and agent userMessage", async () => {
    const run = vi.fn().mockResolvedValue({ text: "r", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u1" }).mockResolvedValueOnce({ id: "a1" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    await runColcoorUserTurn(api, agent, "conv1", null, "  a\rb  ", "");

    expect(appendEvent.mock.calls[0][1].content).toBe("a\nb");
    expect(run.mock.calls[0][0].userMessage).toBe("a\nb");
  });

  it("returns cancelled without assistant append when agent.run aborts", async () => {
    const run = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValue({ id: "u-abort" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;

    const out = await runColcoorUserTurn(api, agent, "conv1", null, "x", "");
    expect(out).toEqual({ userEventId: "u-abort", cancelled: true });
    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(appendEvent.mock.calls[0][1].kind).toBe("user_input");
  });

  it("forwards signal and onAssistantTextDelta to the agent", async () => {
    const run = vi.fn().mockResolvedValue({ text: "ok", stub: "none" as const });
    const agent = { run } as unknown as AgentRunner;
    const appendEvent = vi.fn().mockResolvedValueOnce({ id: "u" }).mockResolvedValueOnce({ id: "a" });
    const api = {
      getTree: vi.fn().mockResolvedValue({ events: linearTree() }),
      listNotes: vi.fn().mockResolvedValue([]),
      appendEvent,
    } as unknown as ColcoorApiClient;
    const ac = new AbortController();
    const onAssistantTextDelta = vi.fn();
    await runColcoorUserTurn(api, agent, "conv1", null, "q", "", {
      signal: ac.signal,
      onAssistantTextDelta,
    });
    expect(run.mock.calls[0][0].signal).toBe(ac.signal);
    expect(run.mock.calls[0][0].onTextDelta).toBe(onAssistantTextDelta);
  });
});
