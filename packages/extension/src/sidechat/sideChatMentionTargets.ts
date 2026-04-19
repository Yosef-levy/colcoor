import type { MeOut } from "../api/client";
import { normalizedMentionLookupKeys } from "./sideChatMentionKeys";

/**
 * Build possible mention handles that can refer to the current user (side-chat notifications + sounds).
 */
export function mentionTargetsForMe(me: MeOut | null): string[] {
  if (!me) {
    return [];
  }
  return normalizedMentionLookupKeys({
    display_name: me.display_name,
    email: me.email,
    handle: me.handle,
  });
}
