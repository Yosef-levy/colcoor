import { describe, expect, it } from "vitest";
import { profilePatchFromInputs } from "./profilePatchPlan";

describe("profilePatchFromInputs", () => {
  it("returns cancelled when display name prompt was cancelled", () => {
    expect(profilePatchFromInputs(undefined, undefined)).toEqual({ ok: false, reason: "cancelled" });
    expect(profilePatchFromInputs(undefined, "https://x")).toEqual({ ok: false, reason: "cancelled" });
  });

  it("includes only display_name when avatar prompt was cancelled", () => {
    expect(profilePatchFromInputs("Ada", undefined)).toEqual({ ok: true, patch: { display_name: "Ada" } });
  });

  it("sets avatar_url null when avatar input is empty string", () => {
    expect(profilePatchFromInputs("Ada", "")).toEqual({
      ok: true,
      patch: { display_name: "Ada", avatar_url: null },
    });
    expect(profilePatchFromInputs("Ada", "  ")).toEqual({
      ok: true,
      patch: { display_name: "Ada", avatar_url: null },
    });
  });

  it("trims non-empty avatar URL", () => {
    expect(profilePatchFromInputs("Bob", "  https://cdn/x.png  ")).toEqual({
      ok: true,
      patch: { display_name: "Bob", avatar_url: "https://cdn/x.png" },
    });
  });

  it("normalizes CRLF in display name and avatar URL", () => {
    expect(profilePatchFromInputs("  Ada\r\n", "  https://x/y\r\n")).toEqual({
      ok: true,
      patch: { display_name: "Ada", avatar_url: "https://x/y" },
    });
  });

  it("rejects non-http(s) avatar URLs", () => {
    const out = profilePatchFromInputs("Ada", "javascript:alert(1)");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("invalid_avatar_url");
      expect(out.message).toMatch(/http/);
    }
  });

  it("rejects data: avatar URLs", () => {
    const out = profilePatchFromInputs("Ada", "data:text/html,hi");
    expect(out).toMatchObject({ ok: false, reason: "invalid_avatar_url" });
  });

  it("accepts http avatar URL", () => {
    expect(profilePatchFromInputs("Ada", "http://cdn.example/a.png")).toEqual({
      ok: true,
      patch: { display_name: "Ada", avatar_url: "http://cdn.example/a.png" },
    });
  });
});
