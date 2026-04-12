import { describe, expect, it } from "vitest";
import { markdownToSafeHtml } from "./threadMarkdown";

describe("markdownToSafeHtml", () => {
  it("renders GFM and strips script tags", () => {
    const html = markdownToSafeHtml("# Hi\n\n* item\n\n<script>x</script>");
    expect(html).toContain("<h1");
    expect(html).toContain("Hi");
    expect(html).toContain("<ul");
    expect(html).not.toContain("script");
  });
});
