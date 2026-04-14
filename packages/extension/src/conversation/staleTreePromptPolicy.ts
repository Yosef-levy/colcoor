export type StaleTreePromptInput = {
  previousSelectedEventId: string | undefined;
  previousEventIds: ReadonlySet<string>;
  nextEventIds: ReadonlySet<string>;
  alreadyPromptedForEventId: string | null;
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
