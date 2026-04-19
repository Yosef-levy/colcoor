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

/**
 * Soft-delete permission: authors delete own user lines; conversation owners may delete any row
 * (backend `soft_delete_side_chat_message`).
 */
export function canDeleteSideChatMessage(
  m: { kind: string; author_user_id: string | null; deleted_at: string | null },
  viewerUserId: string | null,
  viewerRole: "owner" | "editor" | "viewer" | null,
): boolean {
  if (m.deleted_at != null) {
    return false;
  }
  if (viewerRole === "owner") {
    return true;
  }
  if (m.kind !== "user") {
    return false;
  }
  if (viewerUserId == null) {
    return false;
  }
  return m.author_user_id === viewerUserId;
}
