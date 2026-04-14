export type TreeEventActorRef = {
  id: string;
  kind: string;
  actor_user_id: string | null;
};

export type StaleTreePromptInput = {
  previousSelectedEventId: string | undefined;
  previousEventIds: ReadonlySet<string>;
  nextEventIds: ReadonlySet<string>;
  alreadyPromptedForEventId: string | null;
};

export type StaleTreeRemoteGrowthPromptInput = {
  previousEventIds: ReadonlySet<string>;
  nextEvents: readonly TreeEventActorRef[];
  /** Caller’s user id from GET /me; when empty, no remote prompt is derived. */
  viewerUserId: string;
  /** Fingerprint returned on the last growth prompt for this conversation (dedupe). */
  alreadyPromptedFingerprint: string | null;
};

/**
 * Prompt when the previously selected node existed locally but disappeared on refresh.
 * Returns the event id key for one-time de-duplication, or null when no prompt should be shown.
 */
export function staleTreeMissingSelectionPromptKey(input: StaleTreePromptInput): string | null {
  const prev = input.previousSelectedEventId?.trim();
  if (!prev) {
    return null;
  }
  if (input.alreadyPromptedForEventId === prev) {
    return null;
  }
  if (!input.previousEventIds.has(prev)) {
    return null;
  }
  if (input.nextEventIds.has(prev)) {
    return null;
  }
  return prev;
}

/**
 * When the tree already had events locally and a refresh adds **new** `user_input` rows authored by
 * someone other than the viewer, the shared tree changed on the server ([ui-features.md] §11).
 * Returns a stable fingerprint for one-time dedupe, or null when no prompt should be shown.
 */
export function staleTreeRemoteCollaboratorGrowthFingerprint(
  input: StaleTreeRemoteGrowthPromptInput,
): string | null {
  const viewer = input.viewerUserId.trim();
  if (!viewer) {
    return null;
  }
  if (input.previousEventIds.size === 0) {
    return null;
  }
  const remoteNewUserInputIds: string[] = [];
  for (const e of input.nextEvents) {
    if (input.previousEventIds.has(e.id)) {
      continue;
    }
    if (e.kind !== "user_input") {
      continue;
    }
    const actor = e.actor_user_id?.trim();
    if (!actor || actor === viewer) {
      continue;
    }
    remoteNewUserInputIds.push(e.id);
  }
  if (remoteNewUserInputIds.length === 0) {
    return null;
  }
  const fingerprint = [...remoteNewUserInputIds].sort().join("\u001f");
  if (input.alreadyPromptedFingerprint === fingerprint) {
    return null;
  }
  return fingerprint;
}
