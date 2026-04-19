import type { ConversationDrawersModel } from "./drawersModel";
import {
  COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
  COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL,
} from "../util/colcoorApiFailureActions";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Small webview HTML for starred/TODO drawers with jump actions.
 */
export function getConversationDrawersPanelHtml(
  cspSource: string,
  nonce: string,
  model: ConversationDrawersModel,
  preferredTab: "starred" | "todo" = "starred",
  legalPolicyLinks: { label: string; url: string }[] = [],
  /** Open side chat button; when omitted, default label/title are used ([ui-features.md] §10). */
  sideChatButton?: { label: string; title: string },
): string {
  const scLabel =
    sideChatButton && typeof sideChatButton.label === "string" && sideChatButton.label.trim()
      ? sideChatButton.label.trim()
      : "Open side chat";
  const scTitle =
    sideChatButton && typeof sideChatButton.title === "string" && sideChatButton.title.trim()
      ? sideChatButton.title.trim()
      : "Open side chat for this conversation";
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} https: data:`,
    `font-src ${cspSource}`,
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  const starredRows = model.starred
    .map(
      (r) =>
        `<li><button type="button" class="jump" data-event-id="${esc(r.eventId)}">${esc(r.label)}</button></li>`,
    )
    .join("");
  const todoRows = model.todos
    .map(
      (r) =>
        `<li><button type="button" class="jump" data-event-id="${esc(r.eventId)}">${esc(r.label)}</button></li>`,
    )
    .join("");
  const showStarred = preferredTab === "starred" ? "block" : "none";
  const showTodo = preferredTab === "todo" ? "block" : "none";
  const policyBlock =
    legalPolicyLinks.length === 0
      ? ""
      : `<div class="policy-strip" role="region" aria-label="Product policies"><span class="policy-hint">Policies:</span>${legalPolicyLinks
          .map(
            (row) =>
              `<button type="button" class="policy" data-url="${esc(row.url)}" title="Open in browser — ${esc(
                row.url,
              )}">${esc(row.label)}</button>`,
          )
          .join(" ")}</div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Colcoor drawers</title>
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 8px; }
    .tabs button { padding: 4px 10px; }
    .aux { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .aux button { padding: 4px 10px; }
    .policy-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-bottom: 10px;
      font-size: 0.92em;
      color: var(--vscode-descriptionForeground);
    }
    .policy-strip .policy-hint { margin-right: 4px; }
    .policy-strip button.policy { padding: 4px 10px; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    .jump { width: 100%; text-align: left; white-space: normal; }
  </style>
</head>
<body>
  <div class="tabs">
    <button type="button" id="tabStarred">Starred (${model.starred.length})</button>
    <button type="button" id="tabTodo">TODO (${model.todos.length})</button>
  </div>
  <div class="aux">
    <button type="button" id="btnSignIn" title="Sign in to Colcoor with the same account you use in Cursor">Sign in</button>
    <button type="button" id="btnSignOut" title="Sign out of Colcoor">Sign out</button>
    <button type="button" id="btnColcoorMenu" title="Profile, extension settings, legal URLs, sounds, CLI/API setup, and Help (about)">Colcoor menu…</button>
    <button type="button" id="btnOpenConversation" title="Open the main conversation panel for this conversation">Open conversation</button>
    <button type="button" id="btnOpenSideChat" title="${esc(scTitle)}">${esc(scLabel)}</button>
    <button type="button" id="btnSendMessage" title="Send a main-thread message in this conversation (Colcoor: Send message…)">Send message…</button>
    <button type="button" id="btnStopAssistantGeneration" title="Stop the in-flight assistant reply in the conversation panel, if any (Colcoor: Stop assistant generation). Safe no-op when idle.">Stop generation</button>
    <button type="button" id="btnCopySelectedMessage" title="Copy the selected tree message body (Colcoor: Copy selected message; conversation panel must be open)">Copy selection</button>
    <button type="button" id="btnResendAssistant" title="Regenerate assistant under the selected user message (Colcoor: Resend assistant; conversation panel must be open)">Resend</button>
    <button type="button" id="btnJumpToLatestInConversation" title="Select the newest leaf on the default branch (Colcoor: Jump to latest in conversation; conversation panel must be open)">Jump latest</button>
    <button type="button" id="btnListTodoNotesPicker" title="Pick a TODO note to jump to (Colcoor: List TODO notes in conversation)">List TODO notes…</button>
    <button type="button" id="btnListStarredPicker" title="Pick a starred message to jump to (Colcoor: List starred messages in conversation)">List starred…</button>
    <button type="button" id="btnListMembers" title="Show members of this conversation in the Colcoor output channel">Show members</button>
    <button type="button" id="btnAddMember" title="Invite by user id, email, or @handle (Colcoor: Add member)">Add member…</button>
    <button type="button" id="btnRenameConversation" title="Rename this conversation (Colcoor: Rename conversation)">Rename…</button>
    <button type="button" id="btnTogglePinnedConversation" title="Pin or unpin this conversation in the sidebar list (Colcoor: Pin / unpin conversation)">Pin / unpin</button>
    <button type="button" id="btnChangeMemberRole" title="Change a member’s role in this conversation (Colcoor: Change member role)">Change member role…</button>
    <button type="button" id="btnRemoveMember" title="Remove a member from this conversation (Colcoor: Remove member)">Remove member…</button>
    <button type="button" id="btnRefreshConversations" title="Reload the Colcoor conversations list in the sidebar">Refresh conversations</button>
    <button type="button" id="btnRefreshConversationTree" title="Reload the open conversation tree and thread from the server (${esc(
      COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
    )})">${esc(COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL)}</button>
    <button type="button" id="btnReloadDrawersLists" title="Reload starred and TODO lists from the server (Colcoor: Refresh conversation drawers)">Refresh lists</button>
    <button type="button" id="btnToggleConversationsSidebar" title="Show or hide the Colcoor Conversations sidebar">Toggle sidebar</button>
    <button type="button" id="btnNewConversation" title="Create a new conversation">New conversation</button>
    <button type="button" id="btnDeleteConversation" title="Soft-delete this conversation from Colcoor; undo available briefly (Colcoor: Delete conversation)">Delete conversation…</button>
  </div>
  ${policyBlock}
  <ul id="starredList" style="display:${showStarred}">${starredRows || "<li>(none)</li>"}</ul>
  <ul id="todoList" style="display:${showTodo}">${todoRows || "<li>(none)</li>"}</ul>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function showTab(which) {
      var s = document.getElementById("starredList");
      var t = document.getElementById("todoList");
      if (!s || !t) return;
      s.style.display = which === "starred" ? "block" : "none";
      t.style.display = which === "todo" ? "block" : "none";
      vscode.postMessage({ type: "drawersPreferredTab", tab: which });
    }
    document.getElementById("tabStarred").addEventListener("click", function () { showTab("starred"); });
    document.getElementById("tabTodo").addEventListener("click", function () { showTab("todo"); });
    document.getElementById("btnSignIn").addEventListener("click", function () {
      vscode.postMessage({ type: "signIn" });
    });
    document.getElementById("btnSignOut").addEventListener("click", function () {
      vscode.postMessage({ type: "signOut" });
    });
    document.getElementById("btnColcoorMenu").addEventListener("click", function () {
      vscode.postMessage({ type: "openColcoorHub" });
    });
    document.getElementById("btnOpenConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "openConversation" });
    });
    document.getElementById("btnOpenSideChat").addEventListener("click", function () {
      vscode.postMessage({ type: "openSideChat" });
    });
    document.getElementById("btnSendMessage").addEventListener("click", function () {
      vscode.postMessage({ type: "sendMessage" });
    });
    document.getElementById("btnStopAssistantGeneration").addEventListener("click", function () {
      vscode.postMessage({ type: "stopGeneration" });
    });
    document.getElementById("btnCopySelectedMessage").addEventListener("click", function () {
      vscode.postMessage({ type: "copySelectedMessage" });
    });
    document.getElementById("btnResendAssistant").addEventListener("click", function () {
      vscode.postMessage({ type: "resendAssistant" });
    });
    document.getElementById("btnJumpToLatestInConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "jumpToLatestInConversation" });
    });
    document.getElementById("btnListTodoNotesPicker").addEventListener("click", function () {
      vscode.postMessage({ type: "listTodoNotesInConversation" });
    });
    document.getElementById("btnListStarredPicker").addEventListener("click", function () {
      vscode.postMessage({ type: "listStarredMessagesInConversation" });
    });
    document.getElementById("btnListMembers").addEventListener("click", function () {
      vscode.postMessage({ type: "listConversationMembers" });
    });
    document.getElementById("btnAddMember").addEventListener("click", function () {
      vscode.postMessage({ type: "addConversationMember" });
    });
    document.getElementById("btnRenameConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "renameConversation" });
    });
    document.getElementById("btnTogglePinnedConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "togglePinnedConversation" });
    });
    document.getElementById("btnChangeMemberRole").addEventListener("click", function () {
      vscode.postMessage({ type: "changeMemberRole" });
    });
    document.getElementById("btnRemoveMember").addEventListener("click", function () {
      vscode.postMessage({ type: "removeMemberFromConversation" });
    });
    document.getElementById("btnRefreshConversations").addEventListener("click", function () {
      vscode.postMessage({ type: "refreshConversations" });
    });
    document.getElementById("btnRefreshConversationTree").addEventListener("click", function () {
      vscode.postMessage({ type: "refreshConversationTree" });
    });
    document.getElementById("btnReloadDrawersLists").addEventListener("click", function () {
      vscode.postMessage({ type: "reloadDrawersLists" });
    });
    document.getElementById("btnToggleConversationsSidebar").addEventListener("click", function () {
      vscode.postMessage({ type: "toggleConversationsSidebar" });
    });
    document.getElementById("btnNewConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "newConversation" });
    });
    document.getElementById("btnDeleteConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "deleteConversationFromDrawers" });
    });
    showTab("${preferredTab}");
    document.addEventListener("click", function (ev) {
      var pbtn = ev.target && ev.target.closest && ev.target.closest("button.policy");
      if (pbtn) {
        var u = pbtn.getAttribute("data-url");
        if (u) vscode.postMessage({ type: "openLegalPolicyUrl", url: u });
        return;
      }
      var btn = ev.target && ev.target.closest && ev.target.closest("button.jump");
      if (!btn) return;
      var eid = btn.getAttribute("data-event-id");
      if (!eid) return;
      vscode.postMessage({ type: "openEvent", eventId: eid });
    });
  </script>
</body>
</html>`;
}
