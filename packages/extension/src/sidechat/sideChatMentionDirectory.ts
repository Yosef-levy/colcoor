import type { ConversationMember } from "../api/client";
import { normalizedMentionLookupKeys } from "./sideChatMentionKeys";

/** One row for inline side-chat @ autocomplete (serialized in webview state). */
export type SideChatMentionPickItem = {
  /** Full token to insert, including leading @ */
  insert: string;
  label: string;
  description: string;
  /** Lowercase-ish keys used to filter as the user types after @ */
  filterKeys: string[];
};

function fallbackMentionInsert(displayName: string, email: string): string {
  const keys = normalizedMentionLookupKeys({
    display_name: displayName || null,
    email,
    handle: null,
  });
  const first = keys[0];
  return first ? `@${first}` : "";
}

/**
 * Build mention suggestions for everyone in the conversation except the viewer (when viewer id is known).
 */
export function buildSideChatMentionPickList(
  members: readonly ConversationMember[],
  viewerUserId: string | null,
): SideChatMentionPickItem[] {
  const out: SideChatMentionPickItem[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    if (viewerUserId && m.user_id === viewerUserId) {
      continue;
    }
    const email = (m.email ?? "").trim();
    if (!email) {
      continue;
    }
    const handle = (m.handle ?? "").trim();
    const dn = (m.display_name ?? "").trim();
    const insert = handle ? `@${handle}` : fallbackMentionInsert(dn, email);
    if (!insert) {
      continue;
    }
    const k = insert.toLowerCase();
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    const label = dn || handle || m.user_id.slice(0, 8);
    const parts: string[] = [m.role];
    if (handle) {
      parts.push(`@${handle}`);
    }
    parts.push(email);
    const filterKeys = [
      ...normalizedMentionLookupKeys({
        display_name: dn || null,
        email,
        handle: handle || null,
      }),
    ];
    const compactLabel = label.toLowerCase().replace(/\s+/g, "");
    if (compactLabel) {
      filterKeys.push(compactLabel);
    }
    out.push({
      insert,
      label,
      description: parts.join(" · "),
      filterKeys: Array.from(new Set(filterKeys.map((x) => x.toLowerCase()))),
    });
  }
  return out;
}
