import { normalizeOptionalGraphEventId } from "./normalizeUserInputText";

/**
 * Persist only event ids that exist on the current tree, after the same id normalization
 * used elsewhere (whitespace / CRLF from webview postMessage).
 */
export function pruneCollapsedEventIdsForStorage(
  collapsedEventIds: readonly unknown[],
  validIds: ReadonlySet<string>,
): string[] {
  return [
    ...new Set(
      collapsedEventIds
        .map((raw) => normalizeOptionalGraphEventId(String(raw)))
        .filter((id): id is string => id !== undefined && validIds.has(id)),
    ),
  ];
}
