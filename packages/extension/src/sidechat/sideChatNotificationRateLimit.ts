import type { SideChatNotificationDecision } from "./sideChatNotifications";

export const SIDE_CHAT_GENERIC_NOTIFICATION_MIN_GAP_MS = 10_000;
export const SIDE_CHAT_MENTION_NOTIFICATION_MIN_GAP_MS = 2_500;

/**
 * Returns true when enough time has elapsed since last toast.
 */
export function shouldEmitSideChatNotificationNow(args: {
  nowMs: number;
  lastNotificationAtMs: number | null;
  decision: SideChatNotificationDecision;
}): boolean {
  if (!args.decision) {
    return false;
  }
  if (args.lastNotificationAtMs == null) {
    return true;
  }
  const isMention = args.decision.title.toLowerCase().includes("mention");
  const minGap = isMention
    ? SIDE_CHAT_MENTION_NOTIFICATION_MIN_GAP_MS
    : SIDE_CHAT_GENERIC_NOTIFICATION_MIN_GAP_MS;
  return args.nowMs - args.lastNotificationAtMs >= minGap;
}
