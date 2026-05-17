import { formatTreeEventTimeLabel } from "../conversation/treeEventTimeLabel";

/** Side-chat header: relative or absolute time, plus " (edited)" when `edited_at` is set. */
export function formatSideChatMessageMetaLabel(
  createdAt: string | null | undefined,
  editedAt: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  const when = formatTreeEventTimeLabel(createdAt, nowMs);
  if (!when) {
    return "";
  }
  const edited = editedAt != null && String(editedAt).trim() !== "";
  return edited ? `${when} (edited)` : when;
}
