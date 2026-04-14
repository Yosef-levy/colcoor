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

function collaboratorLabel(userId: string, displayNamesByUserId?: Readonly<Record<string, string>>): string {
  const name = displayNamesByUserId?.[userId]?.trim();
  if (name) {
    return name;
  }
  const u = userId.trim();
  if (!u) {
    return "Unknown";
  }
  if (u.length > 12) {
    return `${u.slice(0, 8)}…`;
  }
  return u;
}

function hasAnyDisplayNameForActive(
  activeUserIds: readonly string[],
  displayNamesByUserId?: Readonly<Record<string, string>>,
): boolean {
  if (!displayNamesByUserId) {
    return false;
  }
  return activeUserIds.some((id) => Boolean(displayNamesByUserId[id]?.trim()));
}

/**
 * Short subtitle for active collaborators (from join/leave system messages).
 * When `displayNamesByUserId` includes at least one non-empty label for an active user,
 * uses a compact named list; otherwise falls back to count-only copy.
 */
export function sideChatPresenceSummary(
  messages: readonly SideChatMessageOut[],
  viewerUserId: string | null,
  displayNamesByUserId?: Readonly<Record<string, string>>,
): string | null {
  const active = activeSideChatUserIds(messages, viewerUserId);
  if (active.length === 0) {
    return null;
  }
  if (!hasAnyDisplayNameForActive(active, displayNamesByUserId)) {
    if (active.length === 1) {
      return "1 collaborator active";
    }
    return `${active.length} collaborators active`;
  }
  const labels = active.map((id) => collaboratorLabel(id, displayNamesByUserId));
  if (active.length === 1) {
    return `${labels[0]} active`;
  }
  if (active.length === 2) {
    return `${labels[0]}, ${labels[1]} active`;
  }
  if (active.length === 3) {
    return `${labels[0]}, ${labels[1]}, ${labels[2]} active`;
  }
  return `${labels[0]}, ${labels[1]} +${active.length - 2} others active`;
}
