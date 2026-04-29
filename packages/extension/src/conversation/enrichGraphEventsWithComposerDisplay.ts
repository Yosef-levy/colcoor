import type { ConversationMember, GraphEventNode } from "../api/client";
import { conversationMemberPrimaryLabel } from "./conversationMemberDisplayName";

/** Attach `composer_display_name` for user_input rows from conversation members (tree/thread UI only). */
export function enrichGraphEventsWithComposerDisplay(
  events: readonly GraphEventNode[],
  members: readonly ConversationMember[],
): GraphEventNode[] {
  const byUserId = new Map<string, ConversationMember>();
  for (const m of members) {
    byUserId.set(m.user_id, m);
  }
  return events.map((e) => {
    if (e.kind !== "user_input") {
      return e;
    }
    const uid = e.actor_user_id?.trim();
    if (!uid) {
      return e;
    }
    const name = conversationMemberPrimaryLabel(byUserId.get(uid));
    if (!name) {
      return e;
    }
    return { ...e, composer_display_name: name };
  });
}
