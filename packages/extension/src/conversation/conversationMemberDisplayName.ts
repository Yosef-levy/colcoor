import type { ConversationMember } from "../api/client";

/** Primary label for a member row (matches side-chat mention ordering: name, then @handle, then email). */
export function conversationMemberPrimaryLabel(m: ConversationMember | undefined): string | undefined {
  if (!m) {
    return undefined;
  }
  const dn = m.display_name?.trim();
  if (dn) {
    return dn;
  }
  const h = m.handle?.trim();
  if (h) {
    return `@${h}`;
  }
  const em = m.email?.trim();
  if (em) {
    return em;
  }
  return undefined;
}
