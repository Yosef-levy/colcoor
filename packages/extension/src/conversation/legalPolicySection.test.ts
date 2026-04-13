import { describe, expect, it } from "vitest";
import {
  buildLegalPolicySectionHtml,
  isSafeHttpUrlForWebview,
} from "./legalPolicySection";

describe("isSafeHttpUrlForWebview", () => {
  it("accepts http and https", () => {
    expect(isSafeHttpUrlForWebview("https://example.com/terms")).toBe(true);
    expect(isSafeHttpUrlForWebview("http://127.0.0.1/legal")).toBe(true);
  });

  it("rejects non-http schemes and garbage", () => {
    expect(isSafeHttpUrlForWebview("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrlForWebview("data:text/html,hi")).toBe(false);
    expect(isSafeHttpUrlForWebview("")).toBe(false);
    expect(isSafeHttpUrlForWebview("not a url")).toBe(false);
  });
});

describe("buildLegalPolicySectionHtml", () => {
  it("returns empty when no safe URLs", () => {
    expect(buildLegalPolicySectionHtml({})).toBe("");
    expect(buildLegalPolicySectionHtml({ termsUrl: "javascript:evil()" })).toBe("");
  });

  it("includes only configured safe links", () => {
    const html = buildLegalPolicySectionHtml({
      termsUrl: "https://colcoor.example/terms",
      privacyUrl: "https://colcoor.example/privacy",
    });
    expect(html).toContain("Policies");
    expect(html).toContain('href="https://colcoor.example/terms"');
    expect(html).toContain("Terms");
    expect(html).toContain("Privacy");
    expect(html).not.toContain("Refund");
  });
});
