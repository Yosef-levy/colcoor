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

  it("keeps link safety attrs and inline code", () => {
    const html = markdownToSafeHtml("[x](https://a.test)\n\n`code`");
    expect(html).toContain("noopener");
    expect(html).toContain("https://a.test");
    expect(html).toContain("<code");
  });

  it("adds copy control on fenced code blocks", () => {
    const html = markdownToSafeHtml("```ts\nconst x = 1\n```");
    expect(html).toContain("code-block-wrap");
    expect(html).toContain("code-copy");
    expect(html).toContain("<pre");
  });
});
