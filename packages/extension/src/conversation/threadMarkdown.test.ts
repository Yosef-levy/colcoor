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

  it("renders GFM task lists with disabled checkboxes", () => {
    const html = markdownToSafeHtml("- [ ] todo\n- [x] done");
    expect(html).toContain("<ul");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("todo");
    expect(html).toContain("done");
  });

  it("renders GFM tables", () => {
    const html = markdownToSafeHtml("|a|b|\n|-|-|\n|1|2|");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("1");
  });

  it("renders strikethrough (GFM del)", () => {
    const html = markdownToSafeHtml("~~gone~~");
    expect(html).toContain("<del");
    expect(html).toContain("gone");
  });

  it("autolinks bare https URLs (GFM) with safe link attrs", () => {
    const html = markdownToSafeHtml("See https://example.com/path?q=1 for details.");
    expect(html).toContain('href="https://example.com/path?q=1"');
    expect(html).toContain("noopener");
  });
});
