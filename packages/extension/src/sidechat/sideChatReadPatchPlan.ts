/**
 * Decide whether we should PATCH side-chat read cursor now.
 * Read cursor updates are deferred while panel is hidden to avoid
 * clearing unread counts for messages the user has not actually seen.
 */
export function nextSideChatReadSeqToPatch(
  maxSeqInCache: number,
  lastPatchedReadSeq: number,
  panelVisible: boolean,
): number | null {
  if (!panelVisible) {
    return null;
  }
  if (maxSeqInCache <= lastPatchedReadSeq) {
    return null;
  }
  return maxSeqInCache;
}
