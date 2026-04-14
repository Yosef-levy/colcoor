import type { SideChatMessageOut } from "../api/client";
import { extractSideChatMentions } from "./sideChatMentions";

export type SideChatNotificationDecision = {
  title: string;
  detail: string;
} | null;

type Args = {
  panelVisible: boolean;
  myUserId: string | null;
  myMentionTargets: string[];
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
  const mentionTargets = new Set(args.myMentionTargets.map((s) => s.toLowerCase()));
  const isMentioned =
    args.mentionNotificationsEnabled &&
    mentions.some((h) => mentionTargets.has(h.toLowerCase()));
  if (isMentioned) {
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
