import { describe, expect, it } from "vitest";
import type { GraphEventNode } from "../api/client";
import {
  findBranchTip,
  findBranchTipOrUndeletedAncestor,
  graphPathToTranscriptTurns,
  indexNotesByEventId,
  lowestUndeletedAncestorId,
  mergeEventLineageById,
  pathFromRootToTip,
  trimmedGraphCheckpointLabel,
} from "./treeEvents";

const convId = "00000000-0000-4000-8000-000000000001";

function node(
  partial: Pick<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at"> &
    Partial<Omit<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at">>,
): GraphEventNode {
  return {
    conversation_id: convId,
    actor_type: "user",
    actor_user_id: null,
    content_text: null,
    visible_to: null,
    updated_at: partial.created_at,
    ...partial,
  };
}

describe("findBranchTip", () => {
  it("follows the child with the latest created_at at each step", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
      content_text: "",
    });
    const oldBranch = node({
      id: "old",
      parent_event_id: "r",
      kind: "user_input",
      created_at: "2026-01-01T00:00:01Z",
      content_text: "a",
    });
    const newBranch = node({
      id: "new",
      parent_event_id: "r",
      kind: "user_input",
      created_at: "2026-01-02T00:00:00Z",
      content_text: "b",
    });
    const tip = node({
      id: "tip",
      parent_event_id: "new",
      kind: "assistant_output",
      created_at: "2026-01-02T00:00:01Z",
      content_text: "c",
      actor_type: "assistant",
    });
    const events = [root, oldBranch, newBranch, tip];
    expect(findBranchTip(events).id).toBe("tip");
  });

  it("throws when there is no root", () => {
    const orphan = node({
      id: "x",
      parent_event_id: "missing",
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(() => findBranchTip([orphan])).toThrow(/no root event/);
  });
});

describe("lowestUndeletedAncestorId", () => {
  it("returns the event itself when still visible", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
    });
    const lineage = mergeEventLineageById([root]);
    expect(lowestUndeletedAncestorId("r", new Set(["r"]), lineage)).toBe("r");
  });

  it("walks up to the lowest visible parent when the tip was deleted", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
    });
    const user = node({
      id: "u",
      parent_event_id: "r",
      kind: "user_input",
      created_at: "2026-01-01T00:00:01Z",
    });
    const tip = node({
      id: "tip",
      parent_event_id: "u",
      kind: "assistant_output",
      created_at: "2026-01-01T00:00:02Z",
      actor_type: "assistant",
    });
    const full = mergeEventLineageById([root, user, tip]);
    const visible = new Set(["r", "u"]);
    expect(lowestUndeletedAncestorId("tip", visible, full)).toBe("u");
  });
});

describe("findBranchTipOrUndeletedAncestor", () => {
  it("uses the visible parent when the prior branch tip was deleted", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
    });
    const user = node({
      id: "u",
      parent_event_id: "r",
      kind: "user_input",
      created_at: "2026-01-01T00:00:01Z",
    });
    const tip = node({
      id: "tip",
      parent_event_id: "u",
      kind: "assistant_output",
      created_at: "2026-01-01T00:00:02Z",
      actor_type: "assistant",
    });
    const visible = [root, user];
    const lineage = mergeEventLineageById([root, user, tip]);
    expect(findBranchTipOrUndeletedAncestor(visible, lineage, "tip").id).toBe("u");
  });
});

describe("pathFromRootToTip", () => {
  it("returns ordered chain from root to tip", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
    });
    const child = node({
      id: "c",
      parent_event_id: "r",
      kind: "assistant_output",
      created_at: "2026-01-01T00:00:01Z",
      actor_type: "assistant",
    });
    const events = [root, child];
    const path = pathFromRootToTip(events, child);
    expect(path.map((e) => e.id)).toEqual(["r", "c"]);
  });
});

describe("graphPathToTranscriptTurns", () => {
  it("skips empty bootstrap root user_input", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
      content_text: "",
    });
    const user = node({
      id: "u",
      parent_event_id: "r",
      kind: "user_input",
      created_at: "2026-01-01T00:00:01Z",
      content_text: "hello",
    });
    const path = [root, user];
    expect(graphPathToTranscriptTurns(path)).toEqual([
      { role: "user", content: "hello", notes: [] },
    ]);
  });

  it("includes notes on path events", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
      content_text: "",
    });
    const user = node({
      id: "u",
      parent_event_id: "r",
      kind: "user_input",
      created_at: "2026-01-01T00:00:01Z",
      content_text: "hello",
    });
    const asst = node({
      id: "a",
      parent_event_id: "u",
      kind: "assistant_output",
      created_at: "2026-01-01T00:00:02Z",
      content_text: "hi",
      actor_type: "assistant",
    });
    const notes = indexNotesByEventId([
      {
        id: "n1",
        event_id: "u",
        author_user_id: "00000000-0000-4000-8000-000000000099",
        content: "decide X",
        created_at: "2026-01-01T00:00:01Z",
        updated_at: "2026-01-01T00:00:01Z",
      },
      {
        id: "n2",
        event_id: "a",
        author_user_id: "00000000-0000-4000-8000-000000000099",
        content: "verify Y",
        created_at: "2026-01-01T00:00:03Z",
        updated_at: "2026-01-01T00:00:03Z",
      },
    ]);
    const path = [root, user, asst];
    expect(graphPathToTranscriptTurns(path, notes)).toEqual([
      {
        role: "user",
        content: "hello",
        notes: [{ id: "n1", createdAt: "2026-01-01T00:00:01Z", body: "decide X" }],
      },
      {
        role: "assistant",
        content: "hi",
        notes: [{ id: "n2", createdAt: "2026-01-01T00:00:03Z", body: "verify Y" }],
      },
    ]);
  });

  it("keeps empty bootstrap root when it only has notes", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
      content_text: "",
    });
    const notes = indexNotesByEventId([
      {
        id: "nr",
        event_id: "r",
        author_user_id: "00000000-0000-4000-8000-000000000099",
        content: "root note",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(graphPathToTranscriptTurns([root], notes)).toEqual([
      {
        role: "user",
        content: "",
        notes: [{ id: "nr", createdAt: "2026-01-01T00:00:00Z", body: "root note" }],
      },
    ]);
  });
});

describe("trimmedGraphCheckpointLabel", () => {
  it("returns trimmed text when checkpoint_label is non-empty", () => {
    const ev = node({
      id: "u",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
      checkpoint_label: "  Mile A\r\n",
    });
    expect(trimmedGraphCheckpointLabel(ev)).toBe("Mile A");
  });

  it("returns undefined when missing or whitespace-only", () => {
    expect(
      trimmedGraphCheckpointLabel(
        node({
          id: "u",
          parent_event_id: null,
          kind: "user_input",
          created_at: "2026-01-01T00:00:00Z",
        }),
      ),
    ).toBeUndefined();
    expect(
      trimmedGraphCheckpointLabel(
        node({
          id: "u",
          parent_event_id: null,
          kind: "user_input",
          created_at: "2026-01-01T00:00:00Z",
          checkpoint_label: "  \t\n  ",
        }),
      ),
    ).toBeUndefined();
  });
});
