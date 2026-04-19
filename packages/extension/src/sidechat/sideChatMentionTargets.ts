import type { MeOut } from "../api/client";

/**
 * Build possible mention handles that can refer to the current user.
 */
export function mentionTargetsForMe(me: MeOut | null): string[] {
  if (!me) {
    return [];
  }
  const candidates: string[] = [];
  const push = (v: string | null | undefined): void => {
    if (!v) {
      return;
    }
    const t = v.trim();
    if (!t) {
      return;
    }
    candidates.push(t);
  };
  push(me.display_name);
  const localPart = me.email.split("@")[0] ?? "";
  push(localPart);
  const normalized = candidates
    .map((s) => s.toLowerCase().replace(/\s+/g, "_"))
    .map((s) => s.replace(/[^a-z0-9_.-]/g, ""))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}
