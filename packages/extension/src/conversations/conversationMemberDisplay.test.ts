import { describe, expect, it } from "vitest";

import type { ConversationMember } from "../api/client";
import {
  formatMemberLogLine,
  formatMemberQuickPickLabel,
  memberDisplayNameCell,
  memberEmailCell,
  memberPrimaryPresenceLabel,
} from "./conversationMemberDisplay";

function m(partial: Partial<ConversationMember> & Pick<ConversationMember, "user_id" | "role">): ConversationMember {
  return {
    user_id: partial.user_id,
    role: partial.role,
    email: partial.email ?? null,
    display_name: partial.display_name ?? null,
  };
}

describe("conversationMemberDisplay", () => {
  it("uses an em dash when display name or email is missing", () => {
    const row = m({ user_id: "u1", role: "viewer" });
    expect(memberDisplayNameCell(row)).toBe("—");
    expect(memberEmailCell(row)).toBe("—");
  });

  it("trims display name and email", () => {
    const row = m({
      user_id: "u1",
      role: "editor",
      display_name: "  Pat  ",
      email: " pat@ex.com ",
    });
    expect(memberDisplayNameCell(row)).toBe("Pat");
    expect(memberEmailCell(row)).toBe("pat@ex.com");
  });

  it("formats quick pick label with role", () => {
    expect(
      formatMemberQuickPickLabel(
        m({ user_id: "u1", role: "owner", display_name: "A", email: "a@x" }),
      ),
    ).toBe("owner — A <a@x>");
  });

  it("pads role in log lines for column alignment", () => {
    const line = formatMemberLogLine(
      m({
        user_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        role: "viewer",
        display_name: "X",
        email: "x@y",
      }),
    );
    expect(line).toMatch(/^ {2}viewer {3}X {2}<x@y>/);
    expect(line).toContain("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  });

  it("prefers display name then email for presence subtitle", () => {
    expect(memberPrimaryPresenceLabel(m({ user_id: "u", role: "editor", email: "e@e" }))).toBe("e@e");
    expect(
      memberPrimaryPresenceLabel(
        m({ user_id: "u", role: "editor", display_name: "Sam", email: "e@e" }),
      ),
    ).toBe("Sam");
    expect(memberPrimaryPresenceLabel(m({ user_id: "u", role: "editor" }))).toBe("");
  });
});
