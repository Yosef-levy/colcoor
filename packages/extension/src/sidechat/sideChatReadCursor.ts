/**
 * Derives the read cursor the server expects when the user has seen every
 * message currently in the client cache (api-contracts §10.5 `last_read_seq`).
 */
export function maxSideChatSeq(messages: readonly { seq: number }[]): number {
  if (messages.length === 0) {
    return 0;
  }
  let m = messages[0].seq;
  for (let i = 1; i < messages.length; i++) {
    const s = messages[i].seq;
    if (s > m) {
      m = s;
    }
  }
  return m;
}
