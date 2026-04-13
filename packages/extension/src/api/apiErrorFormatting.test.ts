import { describe, expect, it } from "vitest";
import { formatColcoorApiError, parseApiErrorDetail } from "./apiErrorFormatting";

describe("parseApiErrorDetail", () => {
  it("returns undefined for empty body", () => {
    expect(parseApiErrorDetail("")).toBeUndefined();
    expect(parseApiErrorDetail("   \n")).toBeUndefined();
  });

  it("reads string detail from JSON", () => {
    expect(parseApiErrorDetail(JSON.stringify({ detail: "nope" }))).toBe("nope");
  });

  it("joins validation array messages", () => {
    const body = JSON.stringify({
      detail: [{ msg: "too short" }, { msg: "bad format" }],
    });
    expect(parseApiErrorDetail(body)).toBe("too short; bad format");
  });

  it("returns truncated raw text when not JSON", () => {
    const long = "x".repeat(400);
    const out = parseApiErrorDetail(long);
    expect(out?.length).toBeLessThanOrEqual(281);
    expect(out?.endsWith("…")).toBe(true);
  });
});

describe("formatColcoorApiError", () => {
  it("formats 402 with plan wording", () => {
    const msg = formatColcoorApiError(
      "create conversation",
      402,
      JSON.stringify({ detail: "monthly event quota exceeded" }),
    );
    expect(msg).toContain("Plan or usage limit");
    expect(msg).toContain("create conversation");
    expect(msg).toContain("monthly event quota exceeded");
    expect(msg).toContain("billing");
  });

  it("formats other statuses with HTTP code", () => {
    expect(formatColcoorApiError("update note", 403, '{"detail":"forbidden"}')).toBe(
      "update note failed (HTTP 403): forbidden",
    );
  });
});
