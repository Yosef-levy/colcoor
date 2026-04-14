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

  it("formats HTTP 413 with generic wording", () => {
    expect(formatColcoorApiError("send", 413, '{"detail":"payload too large"}')).toBe(
      "send failed (HTTP 413): payload too large",
    );
  });

  it("formats HTTP 415 with generic wording", () => {
    expect(formatColcoorApiError("post", 415, '{"detail":"unsupported media type"}')).toBe(
      "post failed (HTTP 415): unsupported media type",
    );
  });

  it("formats HTTP 410 with generic wording", () => {
    expect(formatColcoorApiError("get event", 410, '{"detail":"resource retired"}')).toBe(
      "get event failed (HTTP 410): resource retired",
    );
  });

  it("formats HTTP 412 with generic wording", () => {
    expect(formatColcoorApiError("patch event", 412, '{"detail":"If-Match failed"}')).toBe(
      "patch event failed (HTTP 412): If-Match failed",
    );
  });

  it("appends Retry-After hint for HTTP 429 when seconds are provided", () => {
    const msg = formatColcoorApiError("send message", 429, "{}", 90);
    expect(msg).toContain("HTTP 429");
    expect(msg).toContain("Server asked to wait 90 s (Retry-After)");
  });

  it("appends Retry-After hint for HTTP 503 when seconds are provided", () => {
    const msg = formatColcoorApiError("get tree", 503, "{}", 12);
    expect(msg).toContain("HTTP 503");
    expect(msg).toContain("Server asked to wait 12 s (Retry-After)");
  });

  it("does not append Retry-After for 429 when seconds are null", () => {
    const msg = formatColcoorApiError("send", 429, "", null);
    expect(msg).toBe('send failed (HTTP 429): (no response body)');
  });
});
