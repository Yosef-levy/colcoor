/**
 * Next pinned state for sidebar/context pin toggle.
 * `undefined` behaves like unpinned for safety.
 */
export function toggledPinnedState(currentPinned: boolean | undefined): boolean {
  return !currentPinned;
}

export function pinnedVerb(nextPinned: boolean): "pinned" | "unpinned" {
  return nextPinned ? "pinned" : "unpinned";
}
