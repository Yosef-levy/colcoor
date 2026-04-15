import { describe, expect, it } from "vitest";

import { getConversationWebviewHtml } from "./conversationWebviewHtml";
import { TREE_EVENT_DISPLAY_TITLE_MAX, TREE_EVENT_SNIPPET_MAX } from "./treeNodeDisplay";
import {
  PRIVATE_BRANCH_DESCRIPTION,
  PRIVATE_BRANCH_LEAD,
} from "./privateBranchComposerCopy";
import { COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL } from "../util/colcoorApiFailureActions";

describe("getConversationWebviewHtml", () => {
  it("names the tree reload control consistently with the refresh command ([ui-features.md] §6)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonceTreeReload");
    expect(html).toContain(`id="refresh"`);
    expect(html).toContain(`>${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}</button>`);
    expect(html).toContain("sign-in — then click ");
    expect(html).toContain(JSON.stringify(COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL));
  });

  it("embeds tree snippet and display-title limits from treeNodeDisplay ([tree-ui-contract.md] §7)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(`slice(0, ${TREE_EVENT_SNIPPET_MAX})`);
    expect(html).toContain(`slice(0, ${TREE_EVENT_DISPLAY_TITLE_MAX})`);
    expect(html).toContain("(conversation start)");
  });

  it("embeds shared tree event time formatter for node labels ([tree-ui-contract.md] §7)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("function eventTimeLabel(iso)");
    expect(html).toContain("formatTreeEventTimeLabel");
  });

  it("includes legal policy strip and openLegalPolicyUrl wiring ([ui-features.md] §1.3)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="legalPolicyStrip"');
    expect(html).toContain("updateLegalPolicyStrip");
    expect(html).toContain("openLegalPolicyUrl");
    expect(html).toContain("legalPolicyLinks");
  });

  it("detail bar breadcrumb supports optional checkpoint_label on tree nodes ([ui-features.md] §8)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("checkpoint_label");
    expect(html).toContain("crumb-checkpoint");
  });

  it("thread path shows optional checkpoint from segment.checkpointLabel ([ui-features.md] §8)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(".thread .msg .thread-checkpoint");
    expect(html).toContain('class="thread-checkpoint">');
    expect(html).toContain('esc("Checkpoint: " + String(s.checkpointLabel))');
  });

  it("uses dir=auto on the composer textarea for RTL-capable typing", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(
      '<textarea id="input" dir="auto" placeholder="Message… Shift+Enter for newline, Enter to send"></textarea>',
    );
  });

  it("renders an in-flight pending user row before streaming assistant ([ui-features.md] §7)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("pendingUserHtml: null");
    expect(html).toContain("if (state.pendingUserHtml)");
    expect(html).toContain('class="msg user pending-send"');
    expect(html).toContain("state.pendingUserHtml");
    expect(html).toMatch(/if \(state\.pendingUserHtml\)[\s\S]*if \(state\.streamingHtml\)/);
  });

  it("includes optional composer checkpoint label field and send wiring ([ui-features.md] §8)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="checkpointLabel"');
    expect(html).toContain('maxlength="256"');
    expect(html).toContain("if (cpTrim.length) payload.checkpointLabel = cpTrim;");
    expect(html).toContain('cpEl.disabled = state.busy');
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

  it("drives Open side chat label and tooltip from host unread state ([ui-features.md] §10)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("sideChatOpenButtonLabel");
    expect(html).toContain("sideChatOpenButtonTitle");
    expect(html).toContain("openSideChatBtn.textContent");
  });

  it("tree panel hint describes the bottom-right resize handle ([ui-features.md] §5)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(
      "Event tree — click a node to choose where the next reply attaches. Use the resize handle in the bottom-right corner of this panel to change width.",
    );
  });

  it("lays out tree, main thread column, and side chat as three horizontal columns ([ui-features.md] §10)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('class="col-tree"');
    expect(html).toContain('class="col-center"');
    expect(html).toContain('id="colSideChat"');
    expect(html).toContain("sideChatColumnWidthPx: null");
    expect(html).toContain("function applySideChatColumnWidth()");
    expect(html).toContain("function wireSideChatResize()");
    expect(html).toContain("sideChatColumnWidthPx: sw");
    expect(html).toContain("resize handle in the bottom-right corner");
  });

  it("posts treeContextMenu on tree node contextmenu ([tree-ui-contract.md] §5.2)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('vscode.postMessage({ type: "treeContextMenu", id: nid });');
    expect(html).toContain('addEventListener("contextmenu"');
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

  it("Stop posts cancel to the extension host (same signal as Colcoor: Stop assistant generation)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('vscode.postMessage({ type: "cancel" })');
  });

  it("disables Send until the composer has text or pasted images", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('<button id="send" type="button" disabled>Send</button>');
    expect(html).toContain("function updateComposerSendEnabled()");
    expect(html).toContain("pendingSendImages.length");
    expect(html).toContain('addEventListener("paste", function (ev)');
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

  it("uses a Windows-style menubar at the top of the page with Account (allowlisted commands) and Help", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toMatch(/<body>[\s\S]*class="menubar"[\s\S]*<div\s+class="layout"/);
    expect(html).toContain('class="menubar"');
    expect(html).toContain('id="menuBtnConversation"');
    expect(html).toContain('id="menuBtnMessage"');
    expect(html).toContain('id="menuBtnNote"');
    expect(html).toContain('id="menuBtnView"');
    expect(html).toContain('id="menuBtnAccount"');
    expect(html).toContain('id="menuBtnHelp"');
    expect(html).toContain('data-colcoor-command="colcoor.editProfile"');
    expect(html).toContain('data-conv-action="openMembers"');
    expect(html).toContain('vscode.postMessage({ type: "executeColcoorCommand", command: cmd });');
    expect(html).toContain('vscode.postMessage({ type: "openHelp" });');
  });

  it("includes Star/Unstar on the selected message in the detail bar ([ui-features.md] §7)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnToggleStar"');
    expect(html).toContain('toggleStarBtn.textContent = last.starred === true ? "Unstar" : "Star"');
    expect(html).toContain('vscode.postMessage({ type: "toggleStar" })');
  });

  it("includes Add note and List notes on selection in the detail bar ([ui-features.md] §8)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnAddNote"');
    expect(html).toContain('id="btnListNotesOnSelection"');
    expect(html).toContain('vscode.postMessage({ type: "addNote" })');
    expect(html).toContain('vscode.postMessage({ type: "listNotesOnSelection" })');
    expect(html).toContain("addNoteBtn.disabled = true");
    expect(html).toContain("listNotesOnSelectionBtn.disabled = true");
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

  it("includes Starred, TODO, and general Drawers quick actions", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnStarredDrawer"');
    expect(html).toContain('id="btnTodoDrawer"');
    expect(html).toContain('id="btnDrawers"');
    expect(html).toContain("if (starredDrawerBtn) starredDrawerBtn.disabled = state.busy;");
    expect(html).toContain("if (todoDrawerBtn) todoDrawerBtn.disabled = state.busy;");
    expect(html).toContain("if (drawersBtn) drawersBtn.disabled = state.busy;");
    expect(html).toContain('vscode.postMessage({ type: "openStarredDrawer" });');
    expect(html).toContain('vscode.postMessage({ type: "openTodoDrawer" });');
    expect(html).toContain('vscode.postMessage({ type: "openDrawers" });');
  });

  it("includes Members and Add member under Conversation menu (data-conv-action)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('data-conv-action="openMembers"');
    expect(html).toContain('data-conv-action="addMember"');
    expect(html).toContain("function syncConversationMenuPanel()");
    expect(html).toContain('vscode.postMessage({ type: "openMembers" });');
    expect(html).toContain('vscode.postMessage({ type: "addMember" });');
  });

  it("includes change/remove member under Conversation menu", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('data-conv-action="changeMemberRole"');
    expect(html).toContain('data-conv-action="removeMember"');
    expect(html).toContain('vscode.postMessage({ type: "changeMemberRole" });');
    expect(html).toContain('vscode.postMessage({ type: "removeMember" });');
  });

  it("includes Open side chat in View menu and delete conversation via Conversation menu", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnOpenSideChat"');
    expect(html).toContain('data-conv-action="deleteConversation"');
    expect(html).toContain("openSideChatBtn.disabled = state.busy;");
    expect(html).toContain('vscode.postMessage({ type: "openSideChat" });');
    expect(html).toContain('vscode.postMessage({ type: "deleteConversation" });');
    expect(html).not.toContain('id="btnCopyConversationId"');
    expect(html).not.toContain('vscode.postMessage({ type: "copyConversationId" });');
  });

  it("places rename, pin, and delete under the Conversation menu", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="menuPanelConversation"');
    expect(html).toContain('data-conv-action="rename"');
    expect(html).toContain('data-conv-action="togglePin"');
    expect(html).toContain('vscode.postMessage({ type: "rename" });');
    expect(html).toContain('vscode.postMessage({ type: "togglePin" });');
  });

});
