import { describe, expect, it } from "vitest";

import {
  normalizeColcoorInviteUserId,
  validateColcoorInviteUserIdInput,
} from "./conversationMemberInvite";

describe("validateColcoorInviteUserIdInput", () => {
  it("requires non-empty trimmed input", () => {
    expect(validateColcoorInviteUserIdInput("")).toBe("Enter a user id");
    expect(validateColcoorInviteUserIdInput("   ")).toBe("Enter a user id");
    expect(validateColcoorInviteUserIdInput(undefined)).toBe("Enter a user id");
  });

  it("rejects non-UUID strings", () => {
    expect(validateColcoorInviteUserIdInput("user@example.com")).toBe("Expected UUID format");
    expect(validateColcoorInviteUserIdInput("12345678-1234-1234-1234-123456789012")).toBe(
      "Expected UUID format",
    );
  });

  it("accepts lowercase and uppercase UUIDs (RFC variant nibble 8–b)", () => {
    const lower = "aaaaaaaa-bbbb-4ccc-8eee-eeeeeeeeeeee";
    expect(validateColcoorInviteUserIdInput(lower)).toBeUndefined();
    expect(validateColcoorInviteUserIdInput(lower.toUpperCase())).toBeUndefined();
  });

  it("accepts UUID pasted with CRLF and surrounding whitespace", () => {
    expect(
      validateColcoorInviteUserIdInput("  aaaaaaaa-bbbb-4ccc-8eee-eeeeeeeeeeee\r\n"),
    ).toBeUndefined();
  });

  it("accepts UUID version 1 through 8 in the version nibble", () => {
    expect(validateColcoorInviteUserIdInput("11111111-1111-1111-8111-111111111111")).toBeUndefined();
    expect(validateColcoorInviteUserIdInput("22222222-2222-2222-a222-222222222222")).toBeUndefined();
  });

  it("rejects UUID version 9–f", () => {
    expect(validateColcoorInviteUserIdInput("99999999-9999-9999-a999-999999999999")).toBe(
      "Expected UUID format",
    );
  });
});

describe("normalizeColcoorInviteUserId", () => {
  it("matches validation normalization for API submit", () => {
    const raw = "  aaaaaaaa-bbbb-4ccc-8eee-eeeeeeeeeeee\r\n";
    expect(normalizeColcoorInviteUserId(raw)).toBe("aaaaaaaa-bbbb-4ccc-8eee-eeeeeeeeeeee");
    expect(validateColcoorInviteUserIdInput(raw)).toBeUndefined();
  });
});
