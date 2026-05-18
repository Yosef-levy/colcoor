/** Pure invite success copy (no vscode — unit-testable). */

export function formatInviteSuccessMessage(
  displayName: string | null | undefined,
  email: string,
  role: "editor" | "viewer",
): string {
  const who = (displayName && displayName.trim()) || email;
  const roleLabel = role === "editor" ? "Editor" : "Viewer";
  return `Colcoor: added ${who} as ${roleLabel}. They will see this conversation after refreshing Colcoor.`;
}
