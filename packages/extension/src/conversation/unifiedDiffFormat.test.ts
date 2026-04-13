import { describe, expect, it } from "vitest";
import {
  classifyUnifiedDiffLine,
  countUnifiedDiffLineChanges,
  formatUnifiedDiffColoredHtml,
} from "./unifiedDiffFormat";

describe("classifyUnifiedDiffLine", () => {
  it("distinguishes file headers from +/- content", () => {
    expect(classifyUnifiedDiffLine("--- a/foo.ts")).toBe("meta_minus");
    expect(classifyUnifiedDiffLine("+++ b/foo.ts")).toBe("meta_plus");
    expect(classifyUnifiedDiffLine("-removed")).toBe("del");
    expect(classifyUnifiedDiffLine("+added")).toBe("add");
    expect(classifyUnifiedDiffLine(" context")).toBe("ctx");
    expect(classifyUnifiedDiffLine("@@ -1,3 +1,5 @@")).toBe("hunk");
  });
});

describe("countUnifiedDiffLineChanges", () => {
  it("ignores metadata and hunk headers", () => {
    const d = [
      "--- a/x",
      "+++ b/x",
      "@@ -1,2 +1,3 @@",
      " ctx",
      "-old",
      "+new1",
      "+new2",
    ].join("\n");
    expect(countUnifiedDiffLineChanges(d)).toEqual({ added: 2, removed: 1 });
  });
});

describe("formatUnifiedDiffColoredHtml", () => {
  it("escapes HTML and wraps lines with kind classes", () => {
    const html = formatUnifiedDiffColoredHtml("+a<b>\n");
    expect(html).toContain("diff-add");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
  });
});
