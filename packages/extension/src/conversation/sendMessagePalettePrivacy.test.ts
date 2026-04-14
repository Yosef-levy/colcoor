import { describe, expect, it } from "vitest";

import {
  isPrivateBranchFromPrivacyPick,
  sendMessagePrivacyQuickPickItems,
} from "./sendMessagePalettePrivacy";
import { PRIVATE_BRANCH_DESCRIPTION, PRIVATE_BRANCH_LEAD } from "./privateBranchComposerCopy";

describe("sendMessagePrivacyQuickPickItems", () => {
  it("offers shared then private draft with spec copy", () => {
    const items = sendMessagePrivacyQuickPickItems();
    expect(items).toHaveLength(2);
    expect(items[0].label).toBe("Shared");
    expect(items[0].sendAsPrivate).toBe(false);
    expect(items[1].label).toContain(PRIVATE_BRANCH_LEAD);
    expect(items[1].description).toBe(PRIVATE_BRANCH_DESCRIPTION);
    expect(items[1].sendAsPrivate).toBe(true);
  });
});

describe("isPrivateBranchFromPrivacyPick", () => {
  it("treats undefined as shared", () => {
    expect(isPrivateBranchFromPrivacyPick(undefined)).toBe(false);
  });

  it("reflects the picked row", () => {
    const [shared, draft] = sendMessagePrivacyQuickPickItems();
    expect(isPrivateBranchFromPrivacyPick(shared)).toBe(false);
    expect(isPrivateBranchFromPrivacyPick(draft)).toBe(true);
  });
});
