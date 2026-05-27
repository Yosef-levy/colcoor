import { describe, expect, it } from "vitest";

import { getConversationWebviewHtml } from "./conversationWebviewHtml";
import { TREE_EVENT_DISPLAY_TITLE_MAX, TREE_EVENT_SNIPPET_MAX } from "./treeNodeDisplay";
import {
  PRIVATE_BRANCH_DESCRIPTION,
  PRIVATE_BRANCH_LEAD,
} from "./privateBranchComposerCopy";
import { COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL } from "../util/colcoorApiFailureActions";

describe("getConversationWebviewHtml", () => {
  it("shows a conversation tree loading strip (spinner) above the menubar while the host loads the tree", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="conversationLoading"');
    expect(html).toContain("conversation-loading-spinner");
    expect(html).toContain("Loading conversation…");
    expect(html).toContain("conversationLoading: m.conversationLoading === true");
  });

  it("names the tree reload control consistently with the refresh command ([ui-features.md] §6)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonceTreeReload");
    expect(html).toContain(`id="refresh"`);
    expect(html).toContain(">↻</button>");
    expect(html).toContain(`aria-label=${JSON.stringify(COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL)}`);
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

  it("composer exposes queue-after-reply and private-branch controls while the assistant is generating", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="composerWhileWaitingRow"');
    expect(html).toContain('id="btnQueueAfterReply"');
    expect(html).toContain('id="btnNewBranchWhileBusy"');
    expect(html).toContain("waitingForAssistant");
    expect(html).toContain("emitMainComposerSend");
  });

  it("omits detail breadcrumb strip; checkpoint_label still used in tree/thread/search ([ui-features.md] §8)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("checkpoint_label");
    expect(html).not.toContain('id="breadcrumb"');
    expect(html).not.toContain("detail-bar");
  });

  it("thread path shows optional message title from segment.checkpointLabel ([ui-features.md] §8)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(".thread .msg .thread-msg-title");
    expect(html).toContain('class="thread-msg-title">');
    expect(html).toContain('esc("Title: " + String(s.checkpointLabel))');
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
    expect(html).toContain("streamingDisplayParts: []");
    expect(html).toMatch(/if \(state\.pendingUserHtml\)[\s\S]*state\.streamingHtml/);
    expect(html).toContain("renderAssistantDisplayParts(state.streamingDisplayParts, true)");
    expect(html).toContain("renderAssistantDisplayParts(s.displayParts, false)");
    expect(html).toContain('<details class="agent-trace agent-activity"><summary>');
  });

  it("shows an assistant placeholder while busy before stream chunks arrive", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("assistant-waiting");
    expect(html).toContain("Preparing reply");
    expect(html).toContain("} else if (state.busy) {");
  });

  it("threads user rows with a left accent and assistant rows with a right accent", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(
      ".msg.user {\n      background: var(--vscode-editor-inactiveSelectionBackground);\n      border-left: 3px solid var(--vscode-focusBorder);",
    );
    expect(html).toContain(
      ".msg.assistant {\n      background: var(--vscode-textBlockQuote-background);\n      border-right: 3px solid var(--vscode-focusBorder);",
    );
    expect(html).toContain("border-right-style: dashed");
  });

  it("scrolls inline side-chat after a local send (not on passive refresh)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("function markInlineSideChatScrollAfterLocalSend()");
    expect(html).toContain("function scrollInlineSideChatListToBottom()");
    expect(html).toContain("function maybeScrollInlineSideChatAfterLocalSend()");
    expect(html).toContain("markInlineSideChatScrollAfterLocalSend();");
    expect(html).toContain("maybeScrollInlineSideChatAfterLocalSend();");
  });

  it("supports paste-image send flow in inline side-chat composer", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="pendingInlineSideChatImages"');
    expect(html).toContain("pendingInlineSideChatImages = [];");
    expect(html).toContain("function renderPendingInlineSideChatImages()");
    expect(html).toContain("function updateInlineSideChatSendEnabled()");
    expect(html).toContain('getElementById("inlineSideChatInput").addEventListener("paste"');
    expect(html).toContain("if (imgs.length) payload.images = imgs;");
    expect(html).toContain("payload.referencedSideChatMessageId");
  });

  it("inline side-chat uses a message menu (⋯ + right-click), sounds, and host role for owner delete", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="inlineSideChatReplyRow"');
    expect(html).toContain('id="inlineSideChatMsgMenu"');
    expect(html).toContain("function playInlineSideChatSound(kind, volume)");
    expect(html).toContain('m.type === "playSound"');
    expect(html).toContain("sideChatViewerRole: null");
    expect(html).toContain("m.sideChatViewerRole");
    expect(html).toContain("data-inline-sc-menu-btn");
    expect(html).toContain("button.inline-sidechat-msg-menu-btn");
    expect(html).toContain("background: transparent !important");
    expect(html).toContain("contextmenu");
    expect(html).toContain("function inlineSideChatPopulateAndShowMenu(");
    expect(html).toContain("function wireInlineSideChatListActions()");
    expect(html).toContain("function wireInlineSideChatMsgMenuOnce()");
  });

  it("scrolls inline side-chat to first unread on open using sideChatUnreadCount", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("sideChatUnreadCount: 0");
    expect(html).toContain("function scrollInlineSideChatToFirstUnread()");
    expect(html).toContain("prevSideChatPanelOpen");
    expect(html).toContain("scrollInlineSideChatToFirstUnread();");
    expect(html).toContain("m.sideChatUnreadCount");
  });

  it("labels inline side-chat rows with author display name and unread marker vs sideChatLastReadSeq", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("function inlineSideChatAuthorLabel(m)");
    expect(html).toContain("function inlineSideChatMessageUnreadForViewer(m, seqNum, lr)");
    expect(html).toContain("m.meta_label");
    expect(html).toContain("inline-sidechat-time");
    expect(html).toContain("inline-sidechat-msg-self");
    expect(html).toContain("inline-sidechat-msg-peer");
    expect(html).toContain("inline-sidechat-msg-unread");
    expect(html).toContain("inline-sidechat-msg-mention-you");
    expect(html).toContain("inline-sidechat-unread");
    expect(html).toContain("sideChatLastReadSeq: 0");
    expect(html).toContain("viewerUserId: null");
    expect(html).toContain("m.sideChatLastReadSeq");
    expect(html).toContain("m.viewerUserId");
    expect(html).toContain("prevConversationIdForSideChatScroll");
  });

  it("exposes conversation search drawer, scopes, and side-chat row seq for scroll-to-hit", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnOpenSearch"');
    expect(html).toContain("Search…");
    expect(html).toContain('id="searchScopeTitles"');
    expect(html).toContain('id="searchDrawer"');
    expect(html).toContain("wireSearchDrawer");
    expect(html).toContain("conversationNotes: []");
    expect(html).toContain("conversationNotes: Array.isArray(m.conversationNotes)");
    expect(html).toContain("data-sidechat-seq=");
    expect(html).toContain("function scrollInlineSideChatToSeq(seq)");
    expect(html).toContain('m.type === "focusSideChatSeq"');
    expect(html).toContain('type: "searchHit"');
  });

  it("omits composer checkpoint field; Message menu posts editMessageTitle ([ui-features.md] §8)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).not.toContain('id="checkpointLabel"');
    expect(html).toContain('id="btnEditMessageTitle"');
    expect(html).toContain('vscode.postMessage({ type: "editMessageTitle" })');
    expect(html).toContain("node-msg-title");
  });

  it("Message menu includes Edit message for main-thread branch edit", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnEditUserMessage"');
    expect(html).toContain('vscode.postMessage({ type: "editUserMessage" })');
    expect(html).toContain("pendingSendImageRefs");
    expect(html).toContain("applyComposerPrefill");
    expect(html).toContain("composerPrefill");
  });

  it("tree and thread use in-webview message context menu", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="messageCtxMenu"');
    expect(html).toContain("messageContextMenuOptions");
    expect(html).toContain('type: "messageContextAction"');
    expect(html).toContain("wireThreadContextMenu");
    expect(html).toContain("openMessageContextMenuForEvent");
  });

  it("webview inline script parses (no template-literal regex corruption)", () => {
    const nonce = "parseCheckNonce";
    const html = getConversationWebviewHtml("vscode-resource://test", nonce);
    const m = html.match(new RegExp(`<script nonce="${nonce}">([\\s\\S]*?)</script>`));
    expect(m).not.toBeNull();
    expect(() => new Function(m![1])).not.toThrow();
    expect(html).not.toContain(".replace(/\\/g");
  });

  it("renders Private badge in thread rows when segment has privateScope", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("s.privateScope === true");
    expect(html).toContain('<span class="badge-pvt">Private</span>');
  });

  it("renders private-draft composer help behind a ? control", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain(`>${PRIVATE_BRANCH_LEAD}<`);
    expect(html).toContain('id="privateBranchHelp"');
    expect(html).toContain(`title=${JSON.stringify(PRIVATE_BRANCH_DESCRIPTION)}`);
    expect(html).not.toContain('aria-describedby="privateBranchHelp"');
  });

  it("hides private graph rows in the tree when the Private draft checkbox is unchecked", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("function graphEventIsPrivate(e)");
    expect(html).toContain("function showPrivateDraftSubtreeInUi()");
    expect(html).toContain("function effectiveTreeParentKey(e, byId, shownIds, showPrivate)");
    expect(html).toContain("function clampSelectionIfPrivateHidden()");
    expect(html).toContain("wirePrivateBranchUiFilter");
    expect(html).toContain("visibleThreadSegmentsForUi()");
  });

  it("resets Private draft checkbox when conversation changes", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("resetPrivateBranchCheckboxIfConversationChanged");
    expect(html).toContain("prevConversationIdForPrivateBranch");
    expect(html).toContain("priv.checked = false");
  });

  it("marks tree snippets with dir=auto and unicode-bidi for mixed-direction labels", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toMatch(/class="node-snippet[^"]*" dir="auto"/);
    expect(html).toContain("unicode-bidi: plaintext");
  });

  it("cycles tree indent guide color by nesting depth with one line style ([tree-ui-contract.md])", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("tree-nested");
    expect(html).toContain("tree-guide-l0");
    expect(html).toContain("tree-guide-l5");
    expect(html).toContain("d % 6");
    expect(html).toContain("walk(e.id, d + 1)");
    expect(html).toContain('walk("__root__", 0)');
  });

  it("shows staged main-thread reference row and clear postMessage in inline side chat", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="inlineSideChatGraphRefRow"');
    expect(html).toContain('id="btnClearInlineSideChatGraphRef"');
    expect(html).toContain('vscode.postMessage({ type: "clearSideChatGraphReference" })');
    expect(html).toContain("inlineSideChatUpdateGraphRefHint");
  });

  it("drives Open side chat label and tooltip from host unread state ([ui-features.md] §10)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("sideChatOpenButtonLabel");
    expect(html).toContain("sideChatOpenButtonTitle");
    expect(html).toContain("openSideChatBtn.textContent");
  });

  it("tree panel keeps short title and moves explanation to ? help ([ui-features.md] §5)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('<span class="panel-hint-title">Conversation tree</span>');
    expect(html).toContain('id="btnTreeHintHelp"');
    expect(html).toContain("Conversation tree help");
    expect(html).toContain('id="btnCollapseToThread"');
    expect(html).toContain("collapseToCurrentThread");
  });

  it("exposes thread visited-selection back/forward controls under the thread hint", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnSelectionHistoryBack"');
    expect(html).toContain('id="btnSelectionHistoryForward"');
    expect(html).toContain("thread-visit-nav");
    expect(html).toContain('vscode.postMessage({ type: "selectionHistoryBack" })');
    expect(html).toContain('vscode.postMessage({ type: "selectionHistoryForward" })');
    expect(html).toContain("updateThreadVisitNav");
    expect(html).toContain("selectionVisitCanGoBack");
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
    expect(html).toContain('id="btnSideChatHintHelp"');
    expect(html).toContain('id="btnCloseSideChat"');
    expect(html).toContain('id="btnRefreshSideChat"');
    expect(html).not.toContain("Same tab");
  });

  it("scrolls the thread scroll region after renderThread (selection or new messages)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("function scrollThreadToBottom()");
    expect(html).toContain('.closest(".thread-scroll")');
    expect(html).toContain("wrap.scrollTop = wrap.scrollHeight");
    expect(html).toContain("scrollThreadToBottom();");
  });

  it("preserves thread scroll when host sets preserveThreadScroll (note add/edit/delete)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("preserveThreadScroll");
    expect(html).toContain("function restoreThreadScroll(wrap, scrollTop)");
    expect(html).toContain("render({ preserveThreadScroll: m.preserveThreadScroll === true })");
    expect(html).toContain("renderThread({ mode: threadScrollMode })");
    expect(html).toContain("restoreThreadScroll(wrap, prevScrollTop)");
  });

  it("sticks assistant stream scroll to bottom only when already scrolled down", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("function isThreadScrolledToBottom(wrap");
    expect(html).toContain('return "stick"');
    expect(html).toContain('return "force"');
    expect(html).toContain("applyThreadScrollAfterRender");
    expect(html).toContain("function patchStreamingAssistantBody(html)");
    expect(html).toContain("threadStreamScrollPinned");
    expect(html).toContain("wireThreadScrollPinDuringStream");
  });

  it("opens message context menu on tree node contextmenu without changing selection ([tree-ui-contract.md] §5.2)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain("openMessageContextMenuForEvent(ev.clientX, ev.clientY, nid)");
    expect(html).toContain('addEventListener("contextmenu"');
    const treeCtx = html.match(
      /root\.addEventListener\("contextmenu", function \(ev\) \{[\s\S]*?openMessageContextMenuForEvent\(ev\.clientX, ev\.clientY, nid\)/,
    );
    expect(treeCtx).not.toBeNull();
    expect(treeCtx![0]).not.toContain("selectTreeNodeInWebview");
    const threadCtx = html.match(
      /wireThreadContextMenu[\s\S]*?thread\.addEventListener\("contextmenu", function \(ev\) \{[\s\S]*?openMessageContextMenuForEvent/,
    );
    expect(threadCtx).not.toBeNull();
    expect(threadCtx![0]).not.toContain("selectTreeNodeInWebview");
  });

  it("uses dir=auto on trace pre blocks for shell and legacy JSON", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('<pre class="trace-pre" dir="auto">');
    expect(html).toContain('<pre class="trace-pre trace-diff" dir="auto">');
  });

  it("shows clearer busy/send/stop messaging while a reply is in progress", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('sendBtn.textContent = state.busy && !wf ? "Sending…" : "Send"');
    expect(html).toContain('sendBtn.title = "Your message is being sent…"');
    expect(html).toContain('stopBtn.title = state.busy ? "Cancel the in-progress assistant reply." : ""');
    expect(html).toContain("Assistant is replying… You can queue a follow-up or start a branch (see Private draft below).");
    expect(html).toContain("Sending… Press Stop to cancel.");
  });

  it("Stop posts cancel to the extension host (same signal as Colcoor: Stop assistant generation)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('vscode.postMessage({ type: "cancel" })');
  });

  it("includes per-conversation Cursor CLI model selector near Send", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="agentModel"');
    expect(html).toContain('<option value="auto">Auto</option>');
    expect(html).toContain("All models…");
    expect(html).toContain('type: "setAgentModel"');
    expect(html).toContain('type: "openAgentModelPicker"');
    expect(html).toContain("updateAgentModelSelect");
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
    expect(html).toContain("function shouldSendOnEnter(ev)");
    expect(html).toContain("if (ev.isComposing) return false;");
    expect(html).toContain("if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return false;");
    expect(html).toContain("if (!shouldSendOnEnter(e)) return;");
    expect(html).toContain("function scheduleComposerFocus(el)");
    expect(html).toContain('getElementById("inlineSideChatInput").addEventListener("keydown"');
    expect(html).toContain("scheduleComposerFocus(ta)");
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
    expect(html).toContain('data-colcoor-command="colcoor.signOut"');
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

  it("includes Reference in side chat under the Message menu (not View)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnReferenceSideChat"');
    expect(html).toMatch(/id="menuPanelMessage"[\s\S]*?id="btnReferenceSideChat"/);
    expect(html).not.toMatch(/id="menuPanelView"[\s\S]*?id="btnReferenceSideChat"/);
    expect(html).toContain('refSideChatBtn.disabled = state.busy;');
    expect(html).toContain('vscode.postMessage({ type: "referenceInSideChat" });');
  });

  it("includes Delete message branch under the Message menu", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnDeleteMessageBranch"');
    expect(html).toMatch(/id="menuPanelMessage"[\s\S]*?id="btnDeleteMessageBranch"/);
    expect(html).toContain('vscode.postMessage({ type: "deleteMessageBranch" });');
  });

  it("includes Reference note in side chat detail action wiring", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnReferenceNoteSideChat"');
    expect(html).toContain('refNoteSideChatBtn.disabled = state.busy;');
    expect(html).toContain('vscode.postMessage({ type: "referenceNoteInSideChat" });');
  });

  it("places Starred under Message, TODO notes under Note, Starred & TODO under View (slide-in lists drawer)", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce123");
    expect(html).toContain('id="btnStarredDrawer"');
    expect(html).toMatch(/id="menuPanelMessage"[\s\S]*?id="btnStarredDrawer"/);
    expect(html).not.toMatch(/id="menuPanelView"[\s\S]*?id="btnStarredDrawer"/);
    expect(html).toContain('id="btnTodoDrawer"');
    expect(html).toMatch(/id="menuPanelNote"[\s\S]*?id="btnTodoDrawer"/);
    expect(html).toContain('id="btnStarredTodoDrawer"');
    expect(html).toMatch(/id="menuPanelView"[\s\S]*?id="btnStarredTodoDrawer"/);
    expect(html).toContain("Starred &amp; TODO");
    expect(html).toContain("if (starredDrawerBtn) starredDrawerBtn.disabled = state.busy;");
    expect(html).toContain("if (todoDrawerBtn) todoDrawerBtn.disabled = state.busy;");
    expect(html).toContain("if (starredTodoDrawerBtn) starredTodoDrawerBtn.disabled = state.busy;");
    expect(html).toContain('id="listsDrawer"');
    expect(html).toContain("wireListsDrawer");
    expect(html).toContain('openColcoorListsDrawer("starred")');
    expect(html).toContain('openColcoorListsDrawer("todo")');
    expect(html).toContain("drawersStarred: []");
    expect(html).toContain("drawersTodos: []");
  });

  it("includes onboarding banners and collaborator hint regions", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonce-onboard");
    expect(html).toContain('id="gettingStartedBanner"');
    expect(html).toContain('id="tryThisNextBanner"');
    expect(html).toContain('id="collaboratorHint"');
    expect(html).toContain("gettingStartedVisible");
    expect(html).toContain("soloCollaboratorHintDismissed");
    expect(html).toContain("Invite collaborator");
    expect(html).toContain('data-empty-dismiss="');
    expect(html).toContain('vscode.postMessage({ type: "dismissSoloCollaboratorHint" });');
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
