import type { AgentModelCatalogSnapshot } from "../agent/agentModelCatalogCache";
import type { ConversationMember, GraphEventNode } from "../api/client";
import { assistantDisplayModelFromEvent } from "./agentModelDisplay";
import { conversationMemberPrimaryLabel } from "./conversationMemberDisplayName";

/** Attach display labels for tree/thread UI (not returned by the tree API). */
export function enrichGraphEventsWithComposerDisplay(
  events: readonly GraphEventNode[],
  members: readonly ConversationMember[],
  modelCatalog?: AgentModelCatalogSnapshot,
): GraphEventNode[] {
  const byUserId = new Map<string, ConversationMember>();
  for (const m of members) {
    byUserId.set(m.user_id, m);
  }
  return events.map((e) => {
    if (e.kind === "assistant_output" && modelCatalog) {
      const modelLabel = assistantDisplayModelFromEvent(e.content_json ?? undefined, modelCatalog);
      if (modelLabel) {
        return { ...e, assistant_display_model: modelLabel };
      }
      return e;
    }
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
