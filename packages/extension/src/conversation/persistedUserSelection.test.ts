import { describe, expect, it } from "vitest";

import { shouldAutoSelectPersistedUserMessage } from "./persistedUserSelection";

describe("shouldAutoSelectPersistedUserMessage", () => {
  const base = {
    selectPersistedUser: true,
    selectedEventId: "parent",
    replyParentEventId: "parent",
    selectionAtSendStart: "parent",
    selectionRevision: 3,
    selectionRevisionAtSendStart: 3,
  };

  it("selects when the user stayed on the send anchor", () => {
    expect(shouldAutoSelectPersistedUserMessage(base)).toBe(true);
  });

  it("does not select after the user navigates away before persist", () => {
    expect(
      shouldAutoSelectPersistedUserMessage({
        ...base,
        selectedEventId: "other",
        selectionRevision: 4,
      }),
    ).toBe(false);
  });

  it("does not select when selection revision changed but id stayed the same", () => {
    expect(
      shouldAutoSelectPersistedUserMessage({
        ...base,
        selectionRevision: 4,
      }),
    ).toBe(false);
  });

  it("does not select when selectPersistedUser is false", () => {
    expect(
      shouldAutoSelectPersistedUserMessage({
        ...base,
        selectPersistedUser: false,
      }),
    ).toBe(false);
  });
});
