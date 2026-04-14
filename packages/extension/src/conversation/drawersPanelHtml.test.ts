import { describe, expect, it } from "vitest";

import { getConversationDrawersPanelHtml } from "./drawersPanelHtml";
import { sideChatOpenButtonCopy } from "./sideChatOpenButtonLabel";
import { COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL } from "../util/colcoorApiFailureActions";

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
    expect(html).toContain('vscode.postMessage({ type: "drawersPreferredTab", tab: which });');
    expect(html).toContain('showTab("todo")');
    expect(html).toContain('id="btnSignIn"');
    expect(html).toContain('vscode.postMessage({ type: "signIn" });');
    expect(html).toContain('id="btnSignOut"');
    expect(html).toContain('vscode.postMessage({ type: "signOut" });');
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
    expect(html).toContain('id="btnSendMessage"');
    expect(html).toContain('vscode.postMessage({ type: "sendMessage" });');
    expect(html).toContain('id="btnListTodoNotesPicker"');
    expect(html).toContain('vscode.postMessage({ type: "listTodoNotesInConversation" });');
    expect(html).toContain('id="btnListStarredPicker"');
    expect(html).toContain('vscode.postMessage({ type: "listStarredMessagesInConversation" });');
    expect(html).toContain('id="btnListMembers"');
    expect(html).toContain('vscode.postMessage({ type: "listConversationMembers" });');
    expect(html).toContain('id="btnAddMember"');
    expect(html).toContain('vscode.postMessage({ type: "addConversationMember" });');
    expect(html).toContain('id="btnRenameConversation"');
    expect(html).toContain('vscode.postMessage({ type: "renameConversation" });');
    expect(html).toContain('id="btnTogglePinnedConversation"');
    expect(html).toContain('vscode.postMessage({ type: "togglePinnedConversation" });');
    expect(html).toContain('id="btnChangeMemberRole"');
    expect(html).toContain('vscode.postMessage({ type: "changeMemberRole" });');
    expect(html).toContain('id="btnRemoveMember"');
    expect(html).toContain('vscode.postMessage({ type: "removeMemberFromConversation" });');
    expect(html).toContain('id="btnRefreshConversations"');
    expect(html).toContain('vscode.postMessage({ type: "refreshConversations" });');
    expect(html).toContain('id="btnRefreshConversationTree"');
    expect(html).toContain(`>${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}</button>`);
    expect(html).toContain('vscode.postMessage({ type: "refreshConversationTree" });');
    expect(html).toContain('id="btnReloadDrawersLists"');
    expect(html).toContain('vscode.postMessage({ type: "reloadDrawersLists" });');
    expect(html).toContain('id="btnToggleConversationsSidebar"');
    expect(html).toContain('vscode.postMessage({ type: "toggleConversationsSidebar" });');
    expect(html).toContain('id="btnNewConversation"');
    expect(html).toContain('vscode.postMessage({ type: "newConversation" });');
    expect(html).toContain('id="btnDeleteConversation"');
    expect(html).toContain('vscode.postMessage({ type: "deleteConversationFromDrawers" });');
    expect(html).toContain('id="btnSetupCursorCli"');
    expect(html).toContain('id="btnSetCursorAgentApiKey"');
    expect(html).toContain('vscode.postMessage({ type: "setupCursorCli" });');
    expect(html).toContain('vscode.postMessage({ type: "setCursorAgentApiKey" });');
  });

  it("embeds Open side chat label and title from host unread copy ([ui-features.md] §10)", () => {
    const sc = sideChatOpenButtonCopy({ side_chat_unread_count: 2 });
    const html = getConversationDrawersPanelHtml(
      "vscode-resource://test",
      "nonce789",
      { starred: [], todos: [] },
      "starred",
      [],
      sc,
    );
    expect(html).toContain(">Open side chat (2)<");
    expect(html).toContain("Open side chat — 2 unread message(s) for you in this conversation");
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
    expect(html).toContain('showTab("starred")');
  });
});
