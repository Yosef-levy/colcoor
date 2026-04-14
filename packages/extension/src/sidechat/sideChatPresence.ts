import type { SideChatMessageOut } from "../api/client";

export function activeSideChatUserIds(
  messages: readonly SideChatMessageOut[],
  viewerUserId: string | null,
): string[] {
  const state = new Map<string, boolean>();
  const sorted = [...messages].sort((a, b) => a.seq - b.seq);
  for (const m of sorted) {
    const uid = m.author_user_id?.trim() || "";
    if (!uid) {
      continue;
    }
    if (m.kind === "system_join") {
      state.set(uid, true);
    } else if (m.kind === "system_leave") {
      state.set(uid, false);
    }
  }
  return [...state.entries()]
    .filter(([, on]) => on)
    .map(([uid]) => uid)
    .filter((uid) => !viewerUserId || uid !== viewerUserId);
}

export function sideChatPresenceSummary(
  messages: readonly SideChatMessageOut[],
  viewerUserId: string | null,
): string | null {
  const active = activeSideChatUserIds(messages, viewerUserId);
  if (active.length === 0) {
    return null;
  }
  if (active.length === 1) {
    return "1 collaborator active";
  }
  return `${active.length} collaborators active`;
}
