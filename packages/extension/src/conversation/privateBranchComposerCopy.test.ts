import { describe, expect, it } from "vitest";

import {
  PRIVATE_BRANCH_DESCRIPTION,
  PRIVATE_BRANCH_LABEL_TITLE,
  PRIVATE_BRANCH_LEAD,
} from "./privateBranchComposerCopy";

describe("privateBranchComposerCopy", () => {
  it("keeps lead, description, and title non-empty for the webview", () => {
    expect(PRIVATE_BRANCH_LEAD.trim().length).toBeGreaterThan(0);
    expect(PRIVATE_BRANCH_DESCRIPTION.trim().length).toBeGreaterThan(20);
    expect(PRIVATE_BRANCH_LABEL_TITLE.trim().length).toBeGreaterThan(40);
  });
});
