import type { ConversationDrawersModel } from "./drawersModel";

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
): string {
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
    <button type="button" id="btnProfile" title="Edit your Colcoor profile">Profile…</button>
    <button type="button" id="btnSettings" title="Open Colcoor extension settings">Settings</button>
    <button type="button" id="btnAbout" title="About Colcoor">About</button>
    <button type="button" id="btnOpenConversation" title="Open the main conversation panel for this conversation">Open conversation</button>
  </div>
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
    }
    document.getElementById("tabStarred").addEventListener("click", function () { showTab("starred"); });
    document.getElementById("tabTodo").addEventListener("click", function () { showTab("todo"); });
    document.getElementById("btnProfile").addEventListener("click", function () {
      vscode.postMessage({ type: "openProfile" });
    });
    document.getElementById("btnSettings").addEventListener("click", function () {
      vscode.postMessage({ type: "openSettings" });
    });
    document.getElementById("btnAbout").addEventListener("click", function () {
      vscode.postMessage({ type: "openAbout" });
    });
    document.getElementById("btnOpenConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "openConversation" });
    });
    document.addEventListener("click", function (ev) {
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
