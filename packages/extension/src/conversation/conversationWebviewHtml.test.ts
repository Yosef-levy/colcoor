import { describe, expect, it } from "vitest";

import { getConversationWebviewHtml } from "./conversationWebviewHtml";
import {
  PRIVATE_BRANCH_DESCRIPTION,
  PRIVATE_BRANCH_LEAD,
} from "./privateBranchComposerCopy";

describe("getConversationWebviewHtml", () => {
  it("uses dir=auto on the composer textarea for RTL-capable typing", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(
      '<textarea id="input" dir="auto" placeholder="Message… Shift+Enter for newline, Enter to send"></textarea>',
    );
  });

  it("renders expanded private-draft composer help", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(`>${PRIVATE_BRANCH_LEAD}<`);
    expect(html).toContain(PRIVATE_BRANCH_DESCRIPTION);
    expect(html).toContain('id="privateBranchHelp"');
    expect(html).toContain('aria-describedby="privateBranchHelp"');
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
    expect(html).toContain('sendBtn.title = "A reply is in progress. Use Stop to cancel."');
    expect(html).toContain('stopBtn.title = state.busy ? "Cancel the in-progress assistant reply." : ""');
    expect(html).toContain('busyEl.textContent = state.busy ? "Sending… Press Stop to cancel." : "Working…"');
  });

  it("disables Send until the composer has non-whitespace text", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('<button id="send" type="button" disabled>Send</button>');
    expect(html).toContain("function updateComposerSendEnabled()");
    expect(html).toContain('addEventListener("input", function ()');
    expect(html).toContain("updateComposerSendEnabled();");
    expect(html).toContain("if (sb && sb.disabled)");
  });

  it("guards Enter-to-send for IME composition and modifier keys", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("function shouldSendComposerOnEnter(ev)");
    expect(html).toContain("if (ev.isComposing) return false;");
    expect(html).toContain("if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return false;");
    expect(html).toContain("if (!shouldSendComposerOnEnter(e)) return;");
  });

  it("includes Continue from here detail action wiring", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnContinueFromHere"');
    expect(html).toContain('continueBtn.disabled = state.busy;');
    expect(html).toContain('vscode.postMessage({ type: "continueFromHere" });');
  });

  it("includes Reference in side chat detail action wiring", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnReferenceSideChat"');
    expect(html).toContain('refSideChatBtn.disabled = state.busy;');
    expect(html).toContain('vscode.postMessage({ type: "referenceInSideChat" });');
  });

  it("includes Reference note in side chat detail action wiring", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnReferenceNoteSideChat"');
    expect(html).toContain('refNoteSideChatBtn.disabled = state.busy;');
    expect(html).toContain('vscode.postMessage({ type: "referenceNoteInSideChat" });');
  });

  it("includes Starred and TODO quick-access drawer actions", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnStarredDrawer"');
    expect(html).toContain('id="btnTodoDrawer"');
    expect(html).toContain("if (starredDrawerBtn) starredDrawerBtn.disabled = state.busy;");
    expect(html).toContain("if (todoDrawerBtn) todoDrawerBtn.disabled = state.busy;");
    expect(html).toContain('vscode.postMessage({ type: "openStarredDrawer" });');
    expect(html).toContain('vscode.postMessage({ type: "openTodoDrawer" });');
  });

  it("includes Members and Add member quick actions", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnShowMembers"');
    expect(html).toContain('id="btnAddMember"');
    expect(html).toContain("if (showMembersBtn) showMembersBtn.disabled = state.busy;");
    expect(html).toContain("if (addMemberBtn) addMemberBtn.disabled = state.busy;");
    expect(html).toContain('vscode.postMessage({ type: "openMembers" });');
    expect(html).toContain('vscode.postMessage({ type: "addMember" });');
  });

  it("includes change/remove member quick actions", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnChangeMemberRole"');
    expect(html).toContain('id="btnRemoveMember"');
    expect(html).toContain("if (changeMemberRoleBtn) changeMemberRoleBtn.disabled = state.busy;");
    expect(html).toContain("if (removeMemberBtn) removeMemberBtn.disabled = state.busy;");
    expect(html).toContain('vscode.postMessage({ type: "changeMemberRole" });');
    expect(html).toContain('vscode.postMessage({ type: "removeMember" });');
  });

  it("includes Open side chat and Delete conversation quick actions", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnOpenSideChat"');
    expect(html).toContain('id="btnDeleteConversation"');
    expect(html).toContain("if (openSideChatBtn) openSideChatBtn.disabled = state.busy;");
    expect(html).toContain("if (deleteConversationBtn) deleteConversationBtn.disabled = state.busy;");
    expect(html).toContain('vscode.postMessage({ type: "openSideChat" });');
    expect(html).toContain('vscode.postMessage({ type: "deleteConversation" });');
  });
});
