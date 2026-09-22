import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  window: {
    showWarningMessage: vi.fn(),
    showQuickPick: vi.fn(),
  },
}));

import type { DeletedBranchOut } from "../api/client";
import { deletedBranchPickPreview } from "./pickDeletedMessageBranch";

function branch(over: Partial<DeletedBranchOut> = {}): DeletedBranchOut {
  return {
    event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    deletion_group_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    parent_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    kind: "user_input",
    actor_type: "user",
    content_text: null,
    checkpoint_label: null,
    deleted_at: "2026-01-02T00:00:00Z",
    event_count: 1,
    ancestor_deletion_group_ids: [],
    ...over,
  };
}

describe("deletedBranchPickPreview", () => {
  it("prefers checkpoint_label over content", () => {
    expect(
      deletedBranchPickPreview(branch({ checkpoint_label: " Saved ", content_text: "body" })),
    ).toBe("Saved");
  });

  it("truncates long content and labels empty messages", () => {
    expect(deletedBranchPickPreview(branch({ content_text: "  hello   world  " }))).toBe("hello world");
    expect(deletedBranchPickPreview(branch({ content_text: "   " }))).toBe("(empty message)");
    const long = "x".repeat(90);
    const preview = deletedBranchPickPreview(branch({ content_text: long }));
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBe(80);
  });
});
