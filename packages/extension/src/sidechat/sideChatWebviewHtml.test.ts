import { describe, expect, it } from "vitest";

import { getSideChatWebviewHtml } from "./sideChatWebviewHtml";

describe("getSideChatWebviewHtml", () => {
  it("includes code-copy click handler wiring", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(".code-copy");
    expect(html).toContain("btn.closest(\".code-block-wrap\")");
    expect(html).toContain("navigator.clipboard.writeText");
    expect(html).toContain("Failed to copy code block.");
  });
});
