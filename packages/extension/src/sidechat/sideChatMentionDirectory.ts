import type { ConversationMember } from "../api/client";

export type SideChatMentionPickRow = {
  /** Text inserted when the row is picked (includes leading `@` except `@all`, which callers handle separately). */
  insert: string;
  /** Lowercase tokens for prefix matching after `@` in the composer (handle, slugged display name, email local-part). */
  filterKeys: string[];
  /** Primary label for the picker row. */
  label: string;
};

function slugDisplayNameForFilter(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_.-]/g, "");
}

function pushUnique(keys: string[], raw: string): void {
  const t = raw.trim().toLowerCase();
  if (!t || keys.includes(t)) {
    return;
  }
  keys.push(t);
}

/**
 * Build mention picker rows for side chat: excludes the viewer when `viewerUserId` is set.
 * Insert text prefers `@handle` when a handle exists (matches inline composer behavior).
 */
export function buildSideChatMentionPickList(
  members: readonly ConversationMember[],
  viewerUserId: string | null,
): SideChatMentionPickRow[] {
  const viewer = viewerUserId?.trim() ?? "";
  const out: SideChatMentionPickRow[] = [];

  for (const m of members) {
    if (viewer && m.user_id.trim() === viewer) {
      continue;
    }

    const handle = m.handle?.trim() ?? "";
    const emailLocal =
      m.email && m.email.includes("@") ? m.email.split("@")[0]!.trim().toLowerCase() : "";

    const insert =
      handle.length > 0
        ? `@${handle}`
        : m.display_name?.trim()
          ? `@${slugDisplayNameForFilter(m.display_name)}`
          : emailLocal
            ? `@${emailLocal}`
            : `@user`;

    const filterKeys: string[] = [];
    if (handle) {
      pushUnique(filterKeys, handle);
    }
    if (m.display_name?.trim()) {
      pushUnique(filterKeys, slugDisplayNameForFilter(m.display_name));
    }
    if (emailLocal) {
      pushUnique(filterKeys, emailLocal);
    }

    const label =
      m.display_name?.trim() ||
      (handle ? `@${handle}` : "") ||
      m.email?.trim() ||
      m.user_id;

    out.push({ insert, filterKeys, label: String(label) });
  }

  return out;
}
