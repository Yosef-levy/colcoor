import type { SideChatMessageOut } from "../api/client";
import { extractSideChatMentions } from "./sideChatMentions";

export type SideChatNotificationDecision = {
  title: string;
  detail: string;
} | null;

type Args = {
  panelVisible: boolean;
  myUserId: string | null;
  incoming: SideChatMessageOut;
  notificationsEnabled: boolean;
  mentionNotificationsEnabled: boolean;
};

/**
 * Returns notification payload for a newly streamed message, or null.
 */
export function decideSideChatNotification(args: Args): SideChatNotificationDecision {
  if (!args.notificationsEnabled) {
    return null;
  }
  if (args.panelVisible) {
    return null;
  }
  const m = args.incoming;
  if (m.kind !== "user") {
    return null;
  }
  if (m.deleted_at) {
    return null;
  }
  if (args.myUserId && m.author_user_id === args.myUserId) {
    return null;
  }
  const body = (m.body ?? "").trim();
  const mentions = extractSideChatMentions(body);
  if (args.mentionNotificationsEnabled && mentions.length > 0) {
    return {
      title: `Colcoor side chat mention (#${m.seq})`,
      detail: body || "(empty)",
    };
  }
  return {
    title: `Colcoor side chat message (#${m.seq})`,
    detail: body || "(empty)",
  };
}
