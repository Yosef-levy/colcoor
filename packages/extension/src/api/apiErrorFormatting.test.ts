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

  it("normalizes CRLF in string detail and validation messages", () => {
    expect(parseApiErrorDetail(JSON.stringify({ detail: "  err\r\n" }))).toBe("err");
    const body = JSON.stringify({
      detail: [{ msg: "  a\r\nb  " }],
    });
    expect(parseApiErrorDetail(body)).toBe("a\nb");
  });

  it("joins validation array messages", () => {
    const body = JSON.stringify({
      detail: [{ msg: "too short" }, { msg: "bad format" }],
    });
    expect(parseApiErrorDetail(body)).toBe("too short; bad format");
  });

  it("prefers msg over message when both exist on a validation item", () => {
    const body = JSON.stringify({
      detail: [{ msg: "primary", message: "secondary" }],
    });
    expect(parseApiErrorDetail(body)).toBe("primary");
  });

  it("uses message when msg is absent", () => {
    const body = JSON.stringify({
      detail: [{ message: "from message field" }],
    });
    expect(parseApiErrorDetail(body)).toBe("from message field");
  });

  it("skips validation items with no string msg or message", () => {
    const body = JSON.stringify({
      detail: [{ loc: ["body", "x"], type: "missing" }, { msg: "only this" }],
    });
    expect(parseApiErrorDetail(body)).toBe("only this");
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
