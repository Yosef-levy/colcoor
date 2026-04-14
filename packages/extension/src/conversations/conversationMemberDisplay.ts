import type { ConversationMember } from "../api/client";
import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

const EM_DASH = "—";

function normalizedCell(raw: string | null | undefined): string {
  if (raw == null) {
    return "";
  }
  return normalizePersistedUserInputText(raw);
}

export function memberDisplayNameCell(m: ConversationMember): string {
  const t = normalizedCell(m.display_name);
  return t ? t : EM_DASH;
}

export function memberEmailCell(m: ConversationMember): string {
  const t = normalizedCell(m.email);
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
  return normalizedCell(m.display_name) || normalizedCell(m.email) || "";
}
