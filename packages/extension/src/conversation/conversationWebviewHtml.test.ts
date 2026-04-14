import { describe, expect, it } from "vitest";

import { getConversationWebviewHtml } from "./conversationWebviewHtml";

describe("getConversationWebviewHtml", () => {
  it("uses dir=auto on the composer textarea for RTL-capable typing", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(
      '<textarea id="input" dir="auto" placeholder="Message… Shift+Enter for newline, Enter to send"></textarea>',
    );
  });

  it("marks tree snippets with dir=auto and unicode-bidi for mixed-direction labels", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toMatch(/class="node-snippet[^"]*" dir="auto"/);
    expect(html).toContain("unicode-bidi: plaintext");
  });

  it("uses dir=auto on trace pre blocks for shell and legacy JSON", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('<pre class="trace-pre" dir="auto">');
    expect(html).toContain('<pre class="trace-pre trace-diff" dir="auto">');
  });

  it("shows clearer busy/send/stop messaging while a reply is in progress", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('sendBtn.textContent = state.busy ? "Sending…" : "Send"');
    expect(html).toContain('sendBtn.title = state.busy ? "A reply is in progress. Use Stop to cancel." : ""');
    expect(html).toContain('stopBtn.title = state.busy ? "Cancel the in-progress assistant reply." : ""');
    expect(html).toContain('busyEl.textContent = state.busy ? "Sending… Press Stop to cancel." : "Working…"');
  });
});
