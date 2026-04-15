import { randomUUID } from "node:crypto";

import type { MeOut, SideChatMessageOut } from "../api/client";

const OPTIMISTIC_ID_PREFIX = "optimistic:";

export function isOptimisticSideChatMessageId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

export function newOptimisticSideChatMessageId(): string {
  return `${OPTIMISTIC_ID_PREFIX}${randomUUID()}`;
}

/** Local-only row shown until `POST …/side-chat/messages` returns (same shape as API). */
export function buildOptimisticSideChatUserMessage(args: {
  conversationId: string;
  tempId: string;
  seq: number;
  me: MeOut | null;
  body: string;
  contentJson?: Record<string, unknown> | null;
  referencedEventId: string | null;
  referencedNoteId: string | null;
  referencedSideChatMessageId: string | null;
}): SideChatMessageOut {
  const now = new Date().toISOString();
  const dn = args.me?.display_name?.trim();
  return {
    id: args.tempId,
    conversation_id: args.conversationId,
    seq: args.seq,
    kind: "user",
    author_user_id: args.me?.id ?? null,
    author_display_name: dn ? dn : null,
    author_avatar_url: args.me?.avatar_url ?? null,
    body: args.body,
    content_json: args.contentJson ?? null,
    referenced_event_id: args.referencedEventId,
    referenced_note_id: args.referencedNoteId,
    referenced_side_chat_message_id: args.referencedSideChatMessageId,
    created_at: now,
    updated_at: now,
    edited_at: null,
    deleted_at: null,
  };
}
