import { describe, expect, it } from "vitest";

import { getConversationWebviewHtml } from "./conversationWebviewHtml";
import { TREE_EVENT_DISPLAY_TITLE_MAX, TREE_EVENT_SNIPPET_MAX } from "./treeNodeDisplay";
import {
  CONTEXT_REBUILD_COMPOSER_BANNER,
  CONTEXT_REBUILD_SUBTITLE_SUFFIX,
} from "./contextRebuildUserCopy";
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

  it("uses dir=auto on the composer textarea for RTL-capable typing", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(
      '<textarea id="input" dir="auto" placeholder="Message… Shift+Enter for newline, Enter to send"></textarea>',
    );
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

  it("includes Open side chat, Cursor CLI setup, Agent API key, and Delete conversation quick actions", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnOpenSideChat"');
    expect(html).toContain('id="btnSetupCursorCli"');
    expect(html).toContain('id="btnSetCursorAgentApiKey"');
    expect(html).toContain('id="btnDeleteConversation"');
    expect(html).toContain("openSideChatBtn.disabled = state.busy;");
    expect(html).toContain("if (setupCursorCliBtn) setupCursorCliBtn.disabled = state.busy;");
    expect(html).toContain("if (setCursorAgentApiKeyBtn) setCursorAgentApiKeyBtn.disabled = state.busy;");
    expect(html).toContain("if (deleteConversationBtn) deleteConversationBtn.disabled = state.busy;");
    expect(html).toContain('vscode.postMessage({ type: "openSideChat" });');
    expect(html).toContain('vscode.postMessage({ type: "setupCursorCli" });');
    expect(html).toContain('vscode.postMessage({ type: "setCursorAgentApiKey" });');
    expect(html).toContain('vscode.postMessage({ type: "deleteConversation" });');
  });

  it("includes Profile, Settings, Legal URLs, side-chat sounds, and About quick actions", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnProfile"');
    expect(html).toContain('id="btnSettings"');
    expect(html).toContain('id="btnLegalPolicySettings"');
    expect(html).toContain('id="btnSideChatSoundSettings"');
    expect(html).toContain('id="btnAbout"');
    expect(html).toContain("if (profileBtn) profileBtn.disabled = state.busy;");
    expect(html).toContain("if (settingsBtn) settingsBtn.disabled = state.busy;");
    expect(html).toContain("if (legalPolicySettingsBtn) legalPolicySettingsBtn.disabled = state.busy;");
    expect(html).toContain("if (sideChatSoundSettingsBtn) sideChatSoundSettingsBtn.disabled = state.busy;");
    expect(html).toContain("if (aboutBtn) aboutBtn.disabled = state.busy;");
    expect(html).toContain('vscode.postMessage({ type: "openProfile" });');
    expect(html).toContain('vscode.postMessage({ type: "openSettings" });');
    expect(html).toContain('vscode.postMessage({ type: "openLegalPolicySettings" });');
    expect(html).toContain('vscode.postMessage({ type: "openSideChatSoundSettings" });');
    expect(html).toContain('vscode.postMessage({ type: "openAbout" });');
  });

  it("embeds context-rebuild copy, banner region, and render wiring", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="contextRebuildHint"');
    expect(html).toContain("CONTEXT_REBUILD_SUBTITLE_SUFFIX");
    expect(html).toContain("CONTEXT_REBUILD_COMPOSER_BANNER");
    expect(html).toContain(JSON.stringify(CONTEXT_REBUILD_SUBTITLE_SUFFIX));
    expect(html).toContain(JSON.stringify(CONTEXT_REBUILD_COMPOSER_BANNER));
    expect(html).toContain("subBase += CONTEXT_REBUILD_SUBTITLE_SUFFIX");
    expect(html).toContain('getElementById("contextRebuildHint")');
    expect(html).toContain("state.needsContextRebuild && !state.busy");
  });
});
