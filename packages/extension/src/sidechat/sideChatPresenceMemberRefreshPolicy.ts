/** Minimum time between member-list refreshes triggered by join/leave SSE (ms). */
export const SIDECHAT_PRESENCE_MEMBER_REFRESH_MIN_INTERVAL_MS = 8000;

/**
 * Whether a new `listConversationMembers` fetch may start for presence-driven updates.
 * Full `pushState` loads are separate and do not use this gate.
 */
export function shouldStartSideChatPresenceMemberRefresh(args: {
  nowMs: number;
  lastStartMs: number | null;
  inFlight: boolean;
  minIntervalMs?: number;
}): boolean {
  if (args.inFlight) {
    return false;
  }
  const min = args.minIntervalMs ?? SIDECHAT_PRESENCE_MEMBER_REFRESH_MIN_INTERVAL_MS;
  if (args.lastStartMs === null) {
    return true;
  }
  return args.nowMs - args.lastStartMs >= min;
}
