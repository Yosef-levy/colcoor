import { describe, expect, it } from "vitest";
import {
  buildLegalPolicySectionHtml,
  coerceLegalPolicyUrls,
  isSafeHttpUrlForWebview,
  listLegalPolicyLinksForWebview,
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

describe("coerceLegalPolicyUrls", () => {
  it("trims and drops empty strings", () => {
    expect(
      coerceLegalPolicyUrls({
        termsUrl: "  https://a/t  ",
        privacyUrl: "   ",
        refundUrl: null,
      }),
    ).toEqual({ termsUrl: "https://a/t" });
  });
});

describe("listLegalPolicyLinksForWebview", () => {
  it("matches buildLegalPolicySectionHtml ordering and filters unsafe URLs", () => {
    const urls = coerceLegalPolicyUrls({
      termsUrl: "javascript:evil()",
      privacyUrl: "https://x/p",
      refundUrl: "https://x/r",
    });
    const rows = listLegalPolicyLinksForWebview(urls);
    expect(rows.map((r) => r.label)).toEqual(["Privacy", "Refund policy"]);
    expect(rows[0].url).toBe("https://x/p");
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
