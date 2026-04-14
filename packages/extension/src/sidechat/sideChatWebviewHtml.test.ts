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

  it("includes lightweight mention suggestions while typing @", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="mentionSuggestRow"');
    expect(html).toContain("function collectMentionUniverse(messages)");
    expect(html).toContain("function currentMentionQuery(text, caret)");
    expect(html).toContain("function renderMentionSuggestions()");
    expect(html).toContain("mentionUniverse = collectMentionUniverse(d.messages || [])");
    expect(html).toContain('if (ev.key === "Tab" && mentionVisible.length > 0)');
  });

  it("persists side-chat composer textarea height in localStorage and notifies the host for workspace save", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('SIDECHAT_COMPOSER_HEIGHT_KEY = "colcoor.sideChatComposerTextareaHeightPx"');
    expect(html).toContain("function clampComposerHeightPx(v)");
    expect(html).toContain("function applyComposerHeightFromLocalStorage()");
    expect(html).toContain("function wireComposerHeightPersistence()");
    expect(html).toContain("new ResizeObserver(function ()");
    expect(html).toContain("localStorage.setItem(SIDECHAT_COMPOSER_HEIGHT_KEY, String(h));");
    expect(html).toContain('vscode.postMessage({ type: "layout", composerTextareaHeightPx: h });');
  });

  it("applies composer height from state messages (workspace sync)", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("typeof d.composerTextareaHeightPx === \"number\"");
    expect(html).toContain("clampComposerHeightPx(d.composerTextareaHeightPx)");
  });

  it("includes subtitle wiring for presence summary text", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("typeof d.presenceSummary === \"string\" && d.presenceSummary.trim()");
    expect(html).toContain("sub.textContent = countPart + presencePart;");
  });

  it("includes Open conversation, Drawers, Profile, Settings, Legal URLs, side-chat sounds, and About next to Refresh", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnOpenConversation"');
    expect(html).toContain('vscode.postMessage({ type: "openConversation" });');
    expect(html).toContain('id="btnOpenDrawers"');
    expect(html).toContain('vscode.postMessage({ type: "openDrawers" });');
    expect(html).toContain('id="btnProfile"');
    expect(html).toContain('id="btnSettings"');
    expect(html).toContain('id="btnLegalPolicySettings"');
    expect(html).toContain('id="btnSideChatSoundSettings"');
    expect(html).toContain('id="btnAbout"');
    expect(html).toContain('vscode.postMessage({ type: "openProfile" });');
    expect(html).toContain('vscode.postMessage({ type: "openSettings" });');
    expect(html).toContain('vscode.postMessage({ type: "openLegalPolicySettings" });');
    expect(html).toContain('vscode.postMessage({ type: "openSideChatSoundSettings" });');
    expect(html).toContain('vscode.postMessage({ type: "openAbout" });');
  });

  it("includes Sign in and New conversation actions", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnSignIn"');
    expect(html).toContain('id="btnNewConversation"');
    expect(html).toContain('vscode.postMessage({ type: "signIn" });');
    expect(html).toContain('vscode.postMessage({ type: "newConversation" });');
  });

  it("includes Sign out, refresh conversations list, and toggle sidebar actions", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnSignOut"');
    expect(html).toContain('id="btnRefreshConversations"');
    expect(html).toContain('id="btnToggleConversationsSidebar"');
    expect(html).toContain('>Refresh list</button>');
    expect(html).toContain('>Toggle sidebar</button>');
    expect(html).toContain('vscode.postMessage({ type: "signOut" });');
    expect(html).toContain('vscode.postMessage({ type: "refreshConversations" });');
    expect(html).toContain('vscode.postMessage({ type: "toggleConversationsSidebar" });');
  });

  it("includes Cursor CLI setup and agent API key actions", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnSetupCursorCli"');
    expect(html).toContain('id="btnSetCursorAgentApiKey"');
    expect(html).toContain('vscode.postMessage({ type: "setupCursorCli" });');
    expect(html).toContain('vscode.postMessage({ type: "setCursorAgentApiKey" });');
  });

  it("includes rename conversation action ([ui-features.md] §12)", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnRenameConversation"');
    expect(html).toContain('vscode.postMessage({ type: "renameConversation" });');
  });

  it("includes conversation membership actions ([ui-features.md] §12)", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnAddConversationMember"');
    expect(html).toContain('id="btnListConversationMembers"');
    expect(html).toContain('id="btnChangeMemberRole"');
    expect(html).toContain('id="btnRemoveMember"');
    expect(html).toContain('vscode.postMessage({ type: "addConversationMember" });');
    expect(html).toContain('vscode.postMessage({ type: "listConversationMembers" });');
    expect(html).toContain('vscode.postMessage({ type: "changeMemberRole" });');
    expect(html).toContain('vscode.postMessage({ type: "removeMember" });');
  });

  it("includes copy conversation id and pin/unpin actions ([ui-features.md] §4)", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnCopyConversationId"');
    expect(html).toContain('id="btnTogglePinnedConversation"');
    expect(html).toContain('vscode.postMessage({ type: "copyConversationId" });');
    expect(html).toContain('vscode.postMessage({ type: "togglePinnedConversation" });');
  });

  it("includes delete conversation action ([ui-features.md] §4)", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnDeleteConversation"');
    expect(html).toContain('vscode.postMessage({ type: "deleteConversation" });');
  });

  it("includes optional legal policies and openLegalPolicyUrl wiring ([ui-features.md] §1.3)", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonceZ", [
      { label: "Terms", url: "https://example.com/t" },
    ]);
    expect(html).toContain("policy-strip");
    expect(html).toContain('class="policy secondary"');
    expect(html).toContain('data-url="https://example.com/t"');
    expect(html).toContain('vscode.postMessage({ type: "openLegalPolicyUrl", url: u });');
  });

  it("inlines author avatar helpers and render wiring ([ui-features.md] §1.1)", () => {
    const html = getSideChatWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("function sideChatHttpsAvatarUrl(url)");
    expect(html).toContain("function sideChatAuthorSuffix(m)");
    expect(html).toContain('img.className = "msg-avatar"');
    expect(html).toContain("sideChatMetaBase(m) + sideChatAuthorSuffix(m)");
  });
});
