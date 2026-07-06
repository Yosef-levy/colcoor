import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalConversationStore } from "./localConversationStore";

let workspaceRoot: string;
let store: LocalConversationStore;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-local-"));
  store = new LocalConversationStore(workspaceRoot);
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("LocalConversationStore", () => {
  it("stays offline without a workspace: construction succeeds, data ops fail clearly", async () => {
    const inert = new LocalConversationStore("  ");
    expect(inert).toBeInstanceOf(LocalConversationStore);
    // Reads degrade to empty (no crash, no network); writes surface a clear error.
    expect(await inert.listConversations()).toHaveLength(0);
    await expect(inert.createConversation({ title: "x" })).rejects.toThrow(/workspace folder/);
  });

  it("creates a conversation with a single root user_input event", async () => {
    const conv = await store.createConversation({ title: "First" });
    expect(conv.title).toBe("First");

    const tree = await store.getTree(conv.id);
    expect(tree.events).toHaveLength(1);
    const root = tree.events[0];
    expect(root.parent_event_id).toBeNull();
    expect(root.kind).toBe("user_input");
    expect(root.actor_type).toBe("user");

    const state = await store.getConversationCallerState(conv.id);
    expect(state.active_event_id).toBe(root.id);

    const list = await store.listConversations();
    expect(list.map((c) => c.id)).toContain(conv.id);
  });

  it("appends user_input then assistant_output and advances the active node", async () => {
    const conv = await store.createConversation({ title: null });
    const root = (await store.getTree(conv.id)).events[0];

    const user = await store.appendEvent(conv.id, {
      kind: "user_input",
      parent_event_id: root.id,
      content: "hello",
      author: "end_user",
    });
    expect(user.replayed).toBeFalsy();
    expect((await store.getConversationCallerState(conv.id)).active_event_id).toBe(user.id);

    const asst = await store.appendEvent(conv.id, {
      kind: "assistant_output",
      parent_event_id: user.id,
      content: "hi there",
      author: "cursor_agent",
    });

    const tree = await store.getTree(conv.id);
    expect(tree.events).toHaveLength(3);
    const asstNode = tree.events.find((e) => e.id === asst.id);
    expect(asstNode?.kind).toBe("assistant_output");
    expect(asstNode?.actor_type).toBe("assistant");
    expect(asstNode?.actor_user_id).toBeNull();
  });

  it("rejects assistant_output attached to a non-user_input parent", async () => {
    const conv = await store.createConversation({ title: null });
    const root = (await store.getTree(conv.id)).events[0];
    const user = await store.appendEvent(conv.id, {
      kind: "user_input",
      parent_event_id: root.id,
      content: "q",
      author: "end_user",
    });
    const asst = await store.appendEvent(conv.id, {
      kind: "assistant_output",
      parent_event_id: user.id,
      content: "a",
      author: "cursor_agent",
    });
    await expect(
      store.appendEvent(conv.id, {
        kind: "assistant_output",
        parent_event_id: asst.id,
        content: "nope",
        author: "cursor_agent",
      }),
    ).rejects.toThrow();
  });

  it("deduplicates appends by idempotency key", async () => {
    const conv = await store.createConversation({ title: null });
    const root = (await store.getTree(conv.id)).events[0];
    const first = await store.appendEvent(
      conv.id,
      { kind: "user_input", parent_event_id: root.id, content: "once", author: "end_user" },
      { idempotencyKey: "key-1" },
    );
    const second = await store.appendEvent(
      conv.id,
      { kind: "user_input", parent_event_id: root.id, content: "once", author: "end_user" },
      { idempotencyKey: "key-1" },
    );
    expect(second.id).toBe(first.id);
    expect(second.replayed).toBe(true);
    expect((await store.getTree(conv.id)).events).toHaveLength(2);
  });

  it("soft-deletes a subtree (tombstone) and restores it", async () => {
    const conv = await store.createConversation({ title: null });
    const root = (await store.getTree(conv.id)).events[0];
    const user = await store.appendEvent(conv.id, {
      kind: "user_input",
      parent_event_id: root.id,
      content: "branch",
      author: "end_user",
    });
    const asst = await store.appendEvent(conv.id, {
      kind: "assistant_output",
      parent_event_id: user.id,
      content: "reply",
      author: "cursor_agent",
    });

    const del = await store.deleteEventSubtree(conv.id, user.id);
    expect(del.deleted_count).toBe(2);
    expect(del.deletion_group_id).toBeTruthy();

    const afterDelete = await store.getTree(conv.id);
    expect(afterDelete.events.map((e) => e.id)).toEqual([root.id]);
    expect((await store.getConversationCallerState(conv.id)).active_event_id).toBe(root.id);

    const restored = await store.undoEventDeletion(conv.id, del.deletion_group_id as string);
    expect(restored.restored_count).toBe(2);
    const afterRestore = await store.getTree(conv.id);
    expect(afterRestore.events.map((e) => e.id).sort()).toEqual([root.id, user.id, asst.id].sort());
  });

  it("refuses to delete the conversation root", async () => {
    const conv = await store.createConversation({ title: null });
    const root = (await store.getTree(conv.id)).events[0];
    await expect(store.deleteEventSubtree(conv.id, root.id)).rejects.toThrow();
  });

  it("stores events on disk in the append-event JSONL shape", async () => {
    const conv = await store.createConversation({ title: null });
    const root = (await store.getTree(conv.id)).events[0];
    await store.appendEvent(conv.id, {
      kind: "user_input",
      parent_event_id: root.id,
      content: "persisted",
      author: "end_user",
    });
    const raw = await fs.readFile(
      path.join(workspaceRoot, ".colcoor", "conversations", conv.id, "events.jsonl"),
      "utf8",
    );
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    const appended = JSON.parse(lines[1]) as Record<string, unknown>;
    expect(appended.content_text).toBe("persisted");
    expect(appended.parent_event_id).toBe(root.id);
  });

  it("manages notes for an event", async () => {
    const conv = await store.createConversation({ title: null });
    const root = (await store.getTree(conv.id)).events[0];
    const note = await store.createNote(conv.id, { event_id: root.id, content: "todo: x" });
    expect((await store.listNotes(conv.id))).toHaveLength(1);

    const patched = await store.patchNote(conv.id, note.id, { content: "todo: y" });
    expect(patched.content).toBe("todo: y");
    expect((await store.getTree(conv.id)).events[0].note_count).toBe(1);

    await store.deleteNote(conv.id, note.id);
    expect(await store.listNotes(conv.id)).toHaveLength(0);
  });

  it("toggles stars on events", async () => {
    const conv = await store.createConversation({ title: null });
    const root = (await store.getTree(conv.id)).events[0];
    await store.putStar(conv.id, root.id);
    expect((await store.getTree(conv.id)).events[0].starred).toBe(true);
    await store.deleteStar(conv.id, root.id);
    expect((await store.getTree(conv.id)).events[0].starred).toBe(false);
  });

  it("round-trips uploaded images", async () => {
    const conv = await store.createConversation({ title: null });
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const up = await store.uploadConversationImage(conv.id, bytes, "image/png");
    expect(up.byte_size).toBe(4);
    const raw = await store.getConversationImageRaw(conv.id, up.id);
    expect(raw.mimeType).toBe("image/png");
    expect(new Uint8Array(raw.arrayBuffer)).toEqual(bytes);
  });

  it("exposes a single owner member and no side chat in offline mode", async () => {
    const conv = await store.createConversation({ title: null });
    const members = await store.listConversationMembers(conv.id);
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
    expect(await store.listSideChatMessages()).toHaveLength(0);
    await expect(store.postSideChatMessage(conv.id, { kind: "user", body: "x" })).rejects.toThrow();
  });

  it("reads and updates the local profile", async () => {
    const me = await store.getMe();
    expect(me.id).toBeTruthy();
    const updated = await store.patchMe({ display_name: "Ada" });
    expect(updated.display_name).toBe("Ada");
    expect((await store.getMe()).display_name).toBe("Ada");
  });

  it("scopes conversations to the workspace root", async () => {
    await store.createConversation({ title: "here" });
    const otherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-other-"));
    try {
      const otherStore = new LocalConversationStore(otherRoot);
      expect(await otherStore.listConversations()).toHaveLength(0);
    } finally {
      await fs.rm(otherRoot, { recursive: true, force: true });
    }
  });
});
