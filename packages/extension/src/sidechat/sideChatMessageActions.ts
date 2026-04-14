/**
 * Whether the viewer may edit or soft-delete this side-chat row (author-only
 * user lines; api-contracts §10.3–§10.4).
 */
export function canMutateOwnSideChatUserMessage(
  m: { kind: string; author_user_id: string | null; deleted_at: string | null },
  viewerUserId: string | null,
): boolean {
  if (viewerUserId == null) {
    return false;
  }
  return m.kind === "user" && m.author_user_id === viewerUserId && m.deleted_at == null;
}
