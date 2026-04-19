import { describe, expect, it } from "vitest";

import type { ConversationMember } from "../api/client";
import { buildSideChatMentionPickList } from "./sideChatMentionDirectory";

const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PEER = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-cccc-cccccccccccc";

function member(p: Partial<ConversationMember> & Pick<ConversationMember, "user_id" | "email">): ConversationMember {
  return {
    role: "editor",
    display_name: null,
    handle: null,
    ...p,
  };
}

describe("buildSideChatMentionPickList", () => {
  it("prefers @handle for insert when handle is set", () => {
    const rows = buildSideChatMentionPickList(
      [
        member({
          user_id: PEER,
          email: "bob@example.com",
          display_name: "Bob",
          handle: "bobbie",
          role: "editor",
        }),
      ],
      VIEWER,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].insert).toBe("@bobbie");
    expect(rows[0].filterKeys).toContain("bobbie");
    expect(rows[0].filterKeys).toContain("bob");
  });

  it("excludes the viewer", () => {
    const rows = buildSideChatMentionPickList(
      [
        member({ user_id: VIEWER, email: "me@x.com", display_name: "Me", role: "owner" }),
        member({ user_id: OTHER, email: "other@x.com", display_name: "Other", role: "editor" }),
      ],
      VIEWER,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Other");
  });

  it("lists all members when viewer id is null (no self-filter)", () => {
    const only = member({ user_id: OTHER, email: "solo@x.com", role: "owner" });
    expect(buildSideChatMentionPickList([only], null)).toHaveLength(1);
  });
});
