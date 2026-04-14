/**
 * Maps workspace setting `colcoor.sideChatOpenTarget` to `vscode.ViewColumn` values
 * ([ui-features.md] §10 — open/dock placement). Uses numeric literals so Vitest does not
 * depend on the VS Code host at import time.
 */
export const SIDECHAT_VIEW_COLUMN_ACTIVE = -1;
export const SIDECHAT_VIEW_COLUMN_BESIDE = -2;

/**
 * @param raw Setting value from `workspace.getConfiguration("colcoor").get("sideChatOpenTarget")`.
 * @returns {@link SIDECHAT_VIEW_COLUMN_ACTIVE} or {@link SIDECHAT_VIEW_COLUMN_BESIDE}.
 */
export function viewColumnValueForSideChatOpenTarget(raw: string | undefined): number {
  const v = String(raw ?? "beside").trim().toLowerCase();
  if (v === "active") {
    return SIDECHAT_VIEW_COLUMN_ACTIVE;
  }
  if (v === "beside") {
    return SIDECHAT_VIEW_COLUMN_BESIDE;
  }
  return SIDECHAT_VIEW_COLUMN_BESIDE;
}
