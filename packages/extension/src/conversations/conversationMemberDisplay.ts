import type { ConversationMember } from "../api/client";

const EM_DASH = "—";

export function memberDisplayNameCell(m: ConversationMember): string {
  const t = m.display_name?.trim();
  return t ? t : EM_DASH;
}

export function memberEmailCell(m: ConversationMember): string {
  const t = m.email?.trim();
  return t ? t : EM_DASH;
}

/** Sidebar / command quick pick: role, name, email. */
export function formatMemberQuickPickLabel(m: ConversationMember): string {
  return `${m.role} — ${memberDisplayNameCell(m)} <${memberEmailCell(m)}>`;
}

/** One line for the Colcoor output channel member list. */
export function formatMemberLogLine(m: ConversationMember): string {
  return `  ${m.role.padEnd(8)} ${memberDisplayNameCell(m)}  <${memberEmailCell(m)}>  ${m.user_id}`;
}

/**
 * Short label for side-chat presence maps: prefer display name, else email, else empty
 * (caller may keep a previous map entry when still empty).
 */
export function memberPrimaryPresenceLabel(m: ConversationMember): string {
  return (m.display_name ?? "").trim() || (m.email ?? "").trim() || "";
}
