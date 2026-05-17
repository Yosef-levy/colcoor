import type { ColcoorUserMediaImageRef } from "./userEventMedia";

/** Merge image refs for send, preserving order and deduping by `id` (existing refs first). */
export function mergeUserMediaImageRefs(
  existing: readonly ColcoorUserMediaImageRef[],
  uploaded: readonly ColcoorUserMediaImageRef[],
): ColcoorUserMediaImageRef[] {
  const seen = new Set<string>();
  const out: ColcoorUserMediaImageRef[] = [];
  for (const r of [...existing, ...uploaded]) {
    const id = r.id.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(r);
  }
  return out;
}
