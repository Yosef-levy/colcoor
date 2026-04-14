import { describe, expect, it } from "vitest";

import { getConversationDrawersPanelHtml } from "./drawersPanelHtml";

describe("getConversationDrawersPanelHtml", () => {
  it("renders tab buttons and jump wiring", () => {
    const html = getConversationDrawersPanelHtml(
      "vscode-resource://test",
      "nonce123",
      {
        starred: [{ eventId: "e1", label: "User: a", createdAt: "t" }],
        todos: [{ noteId: "n1", eventId: "e2", label: "TODO: b", createdAt: "t" }],
      },
      "todo",
    );
    expect(html).toContain('id="tabStarred"');
    expect(html).toContain('id="tabTodo"');
    expect(html).toContain('data-event-id="e1"');
    expect(html).toContain('data-event-id="e2"');
    expect(html).toContain('vscode.postMessage({ type: "openEvent", eventId: eid });');
    expect(html).toContain('id="btnProfile"');
    expect(html).toContain('id="btnSettings"');
    expect(html).toContain('id="btnLegalPolicySettings"');
    expect(html).toContain('vscode.postMessage({ type: "openProfile" });');
    expect(html).toContain('vscode.postMessage({ type: "openSettings" });');
    expect(html).toContain('vscode.postMessage({ type: "openLegalPolicySettings" });');
    expect(html).toContain('id="btnAbout"');
    expect(html).toContain('vscode.postMessage({ type: "openAbout" });');
    expect(html).toContain('id="btnOpenConversation"');
    expect(html).toContain('vscode.postMessage({ type: "openConversation" });');
    expect(html).toContain('id="btnOpenSideChat"');
    expect(html).toContain('vscode.postMessage({ type: "openSideChat" });');
    expect(html).toContain('id="btnSetupCursorCli"');
    expect(html).toContain('id="btnSetCursorAgentApiKey"');
    expect(html).toContain('vscode.postMessage({ type: "setupCursorCli" });');
    expect(html).toContain('vscode.postMessage({ type: "setCursorAgentApiKey" });');
  });

  it("includes optional legal policy strip and openLegalPolicyUrl wiring", () => {
    const html = getConversationDrawersPanelHtml(
      "vscode-resource://test",
      "nonce456",
      { starred: [], todos: [] },
      "starred",
      [
        { label: "Terms", url: "https://example.com/terms" },
        { label: "Privacy", url: "https://example.com/privacy" },
      ],
    );
    expect(html).toContain("policy-strip");
    expect(html).toContain('class="policy"');
    expect(html).toContain('data-url="https://example.com/terms"');
    expect(html).toContain('vscode.postMessage({ type: "openLegalPolicyUrl", url: u });');
  });
});
