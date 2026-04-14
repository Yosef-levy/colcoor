import { describe, expect, it } from "vitest";

import type { SideChatMessageOut } from "../api/client";
import { decideSideChatNotification } from "./sideChatNotifications";

function msg(p: Partial<SideChatMessageOut> & { id: string; seq: number }): SideChatMessageOut {
  return {
    id: p.id,
    conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    seq: p.seq,
    kind: p.kind ?? "user",
    author_user_id: p.author_user_id ?? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    body: p.body ?? "hello",
    referenced_event_id: null,
    referenced_note_id: null,
    referenced_side_chat_message_id: null,
    created_at: "t",
    updated_at: "t",
    edited_at: null,
    deleted_at: p.deleted_at ?? null,
  };
}

describe("decideSideChatNotification", () => {
  it("returns null when notifications disabled or panel visible", () => {
    expect(
      decideSideChatNotification({
        panelVisible: false,
        myUserId: null,
        myMentionTargets: [],
        incoming: msg({ id: "m", seq: 1 }),
        notificationsEnabled: false,
        mentionNotificationsEnabled: true,
      }),
    ).toBeNull();
    expect(
      decideSideChatNotification({
        panelVisible: true,
        myUserId: null,
        myMentionTargets: [],
        incoming: msg({ id: "m", seq: 1 }),
        notificationsEnabled: true,
        mentionNotificationsEnabled: true,
      }),
    ).toBeNull();
  });

  it("returns null for non-user/deleted/self messages", () => {
    expect(
      decideSideChatNotification({
        panelVisible: false,
        myUserId: null,
        myMentionTargets: [],
        incoming: msg({ id: "m", seq: 1, kind: "system_join" }),
        notificationsEnabled: true,
        mentionNotificationsEnabled: true,
      }),
    ).toBeNull();
    expect(
      decideSideChatNotification({
        panelVisible: false,
        myUserId: null,
        myMentionTargets: [],
        incoming: msg({ id: "m", seq: 1, deleted_at: "x" }),
        notificationsEnabled: true,
        mentionNotificationsEnabled: true,
      }),
    ).toBeNull();
    expect(
      decideSideChatNotification({
        panelVisible: false,
        myUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        myMentionTargets: [],
        incoming: msg({ id: "m", seq: 1, author_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
        notificationsEnabled: true,
        mentionNotificationsEnabled: true,
      }),
    ).toBeNull();
  });

  it("prioritizes mention notification title when message mentions me", () => {
    const out = decideSideChatNotification({
      panelVisible: false,
      myUserId: null,
      myMentionTargets: ["alice"],
      incoming: msg({ id: "m", seq: 3, body: "hi @alice" }),
      notificationsEnabled: true,
      mentionNotificationsEnabled: true,
    });
    expect(out?.title).toContain("mention");
  });

  it("falls back to generic message notification", () => {
    const out = decideSideChatNotification({
      panelVisible: false,
      myUserId: null,
      myMentionTargets: ["bob"],
      incoming: msg({ id: "m", seq: 2, body: "hi @alice" }),
      notificationsEnabled: true,
      mentionNotificationsEnabled: false,
    });
    expect(out?.title).toContain("message");
  });

  it("falls back to generic notification when mentions do not match me", () => {
    const out = decideSideChatNotification({
      panelVisible: false,
      myUserId: null,
      myMentionTargets: ["charlie"],
      incoming: msg({ id: "m", seq: 4, body: "hi @alice" }),
      notificationsEnabled: true,
      mentionNotificationsEnabled: true,
    });
    expect(out?.title).toContain("message");
  });
});
