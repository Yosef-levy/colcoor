import { describe, expect, it } from "vitest";
import { profilePatchFromInputs } from "./profilePatchPlan";

describe("profilePatchFromInputs", () => {
  it("returns null when display name prompt was cancelled", () => {
    expect(profilePatchFromInputs(undefined, undefined)).toBeNull();
    expect(profilePatchFromInputs(undefined, "https://x")).toBeNull();
  });

  it("includes only display_name when avatar prompt was cancelled", () => {
    expect(profilePatchFromInputs("Ada", undefined)).toEqual({ display_name: "Ada" });
  });

  it("sets avatar_url null when avatar input is empty string", () => {
    expect(profilePatchFromInputs("Ada", "")).toEqual({
      display_name: "Ada",
      avatar_url: null,
    });
    expect(profilePatchFromInputs("Ada", "  ")).toEqual({
      display_name: "Ada",
      avatar_url: null,
    });
  });

  it("trims non-empty avatar URL", () => {
    expect(profilePatchFromInputs("Bob", "  https://cdn/x.png  ")).toEqual({
      display_name: "Bob",
      avatar_url: "https://cdn/x.png",
    });
  });

  it("normalizes CRLF in display name and avatar URL", () => {
    expect(profilePatchFromInputs("  Ada\r\n", "  https://x/y\r\n")).toEqual({
      display_name: "Ada",
      avatar_url: "https://x/y",
    });
  });
});
