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

  it("includes playSound message handling and audio cue helpers", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("function playSideChatSound(kind)");
    expect(html).toContain("window.AudioContext || window.webkitAudioContext");
    expect(html).toContain("d.type === \"playSound\"");
  });

  it("includes reference chip rendering hooks", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("reference_chips");
    expect(html).toContain("className = \"ref-chip\"");
    expect(html).toContain("dataset.refKind");
    expect(html).toContain("type: \"openReference\"");
  });

  it("includes composer referenced-event controls", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("id=\"refEventRow\"");
    expect(html).toContain("clearRefEvent");
    expect(html).toContain("referencedEventId");
    expect(html).toContain("id=\"refNoteRow\"");
    expect(html).toContain("clearRefNote");
    expect(html).toContain("referencedNoteId");
  });

  it("exposes RTL-friendly composer and message bodies (dir=auto, unicode-bidi)", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('<textarea id="input" dir="auto" placeholder="Message…"></textarea>');
    expect(html).toContain("unicode-bidi: plaintext");
    expect(html).toContain('body.setAttribute("dir", "auto")');
    expect(html).toContain('ta.setAttribute("dir", "auto")');
  });

  it("disables Send until composer has non-whitespace text", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('<button id="send" type="button" disabled');
    expect(html).toContain("function updateComposerSendEnabled()");
    expect(html).toContain("if (!String(t).trim())");
    expect(html).toContain('addEventListener("input", function ()');
    expect(html).toContain("if (send && send.disabled) return;");
    expect(html).toContain("updateComposerSendEnabled();");
  });
});
