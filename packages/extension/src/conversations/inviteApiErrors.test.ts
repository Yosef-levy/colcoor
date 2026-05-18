import { describe, expect, it } from "vitest";

import { formatInviteSuccessMessage } from "./inviteSuccessMessage";

describe("inviteApiErrors", () => {
  it("formats success with role label", () => {
    const msg = formatInviteSuccessMessage("Ada", "ada@example.com", "editor");
    expect(msg).toContain("Ada");
    expect(msg).toContain("Editor");
  });

});
