import type { SideChatMessageOut } from "../api/client";
import { extractSideChatMentions } from "./sideChatMentions";

export type SideChatSoundKind = "message" | "mention";

type Args = {
  panelVisible: boolean;
  myUserId: string | null;
  myMentionTargets: string[];
  incoming: SideChatMessageOut;
  messageSoundEnabled: boolean;
  mentionSoundEnabled: boolean;
};

/**
 * Decide whether to play a side-chat sound cue in the visible webview.
 */
export function decideSideChatSoundKind(args: Args): SideChatSoundKind | null {
  if (!args.panelVisible) {
    return null;
  }
  const m = args.incoming;
  if (m.kind !== "user" || m.deleted_at) {
    return null;
  }
  if (args.myUserId && m.author_user_id === args.myUserId) {
    return null;
  }
  const body = (m.body ?? "").trim();
  const mentions = extractSideChatMentions(body);
  const targets = new Set(args.myMentionTargets.map((s) => s.toLowerCase()));
  const isMention = mentions.some((h) => targets.has(h.toLowerCase()));
  if (isMention && args.mentionSoundEnabled) {
    return "mention";
  }
  if (args.messageSoundEnabled) {
    return "message";
  }
  return null;
}
