/**
 * Normalized lookup tokens for side-chat @mentions (notifications + autocomplete filtering).
 * Matches {@link extractSideChatMentions} semantics: case-insensitive compare on these strings.
 */
export function normalizedMentionLookupKeys(p: {
  display_name?: string | null;
  email: string;
  handle?: string | null;
}): string[] {
  const keys = new Set<string>();
  const h = p.handle?.trim();
  if (h) {
    keys.add(h.toLowerCase());
  }
  const dn = (p.display_name ?? "").trim();
  if (dn) {
    const slug = dn
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_.-]/g, "");
    if (slug) {
      keys.add(slug);
    }
  }
  const local = (p.email.split("@")[0] ?? "").trim();
  if (local) {
    const slug = local
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_.-]/g, "");
    if (slug) {
      keys.add(slug);
    }
  }
  return Array.from(keys);
}
