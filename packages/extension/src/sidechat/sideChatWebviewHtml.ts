/** Minimal side-chat webview (list + send + refresh + markdown rendering). */

import { SIDECHAT_AUTHOR_WEBVIEW_JS } from "./sideChatAuthorWebviewRuntime";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getSideChatWebviewHtml(
  cspSource: string,
  nonce: string,
  legalPolicyLinks: { label: string; url: string }[] = [],
): string {
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} https: data:`,
    `font-src ${cspSource}`,
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  const policyBlock =
    legalPolicyLinks.length === 0
      ? ""
      : `<div class="policy-strip" role="region" aria-label="Product policies"><span class="policy-hint">Policies:</span>${legalPolicyLinks
          .map(
            (row) =>
              `<button type="button" class="policy secondary" data-url="${esc(row.url)}" title="Open in browser — ${esc(
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
  <title>Colcoor side chat</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      min-height: 0;
    }
    h1 { font-size: 1.05em; font-weight: 600; margin: 0 0 8px; flex-shrink: 0; }
    .hint { color: var(--vscode-descriptionForeground); font-size: 0.92em; margin-bottom: 8px; flex-shrink: 0; }
    #list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      margin-bottom: 10px;
    }
    .msg { margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    .msg:last-child { border-bottom: none; }
    .msg .meta {
      font-size: 0.88em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .msg .meta .msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      object-fit: cover;
      flex-shrink: 0;
    }
    .msg .mentions { display: inline-flex; gap: 6px; margin-left: 8px; flex-wrap: wrap; }
    .msg .refs { display: inline-flex; gap: 6px; margin-left: 8px; flex-wrap: wrap; }
    .msg .mention-chip {
      padding: 1px 6px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editor-background);
      font-size: 0.92em;
    }
    .msg .ref-chip {
      padding: 1px 6px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editor-background);
      font-size: 0.88em;
      font-family: var(--vscode-editor-font-family);
    }
    .msg .body {
      white-space: pre-wrap;
      word-break: break-word;
      unicode-bidi: plaintext;
    }
    .msg .ref {
      border-left: 2px solid var(--vscode-panel-border);
      margin: 0 0 6px;
      padding: 4px 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
      white-space: pre-wrap;
      word-break: break-word;
      unicode-bidi: plaintext;
    }
    .msg .msg-actions { margin-top: 6px; }
    .msg .msg-actions button { padding: 4px 10px; font-size: 0.92em; }
    .msg textarea.edit-ta {
      width: 100%;
      min-height: 56px;
      margin-top: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      padding: 6px;
    }
    .composer { flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
    .composer textarea {
      width: 100%;
      min-height: 64px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      padding: 6px;
    }
    .mention-suggest-row { display: none; gap: 6px; flex-wrap: wrap; margin-top: -2px; }
    .mention-suggest-chip {
      padding: 1px 8px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editor-background);
      font-size: 0.9em;
      cursor: pointer;
    }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    button {
      font-family: var(--vscode-font-family);
      padding: 6px 14px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
    }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .policy-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin: 0 0 8px;
      font-size: 0.92em;
      color: var(--vscode-descriptionForeground);
    }
    .policy-strip .policy-hint { margin-right: 4px; }
    .policy-strip button.policy { padding: 4px 10px; font-size: 0.92em; }
    .err { color: var(--vscode-errorForeground); font-size: 0.92em; }
  </style>
</head>
<body>
  <h1 id="title">Side chat</h1>
  <p class="hint" id="sub">Loading…</p>
  ${policyBlock}
  <div id="list"></div>
  <div class="composer">
    <div class="row" id="replyingRow" style="display:none">
      <div id="replying" class="hint" style="margin:0"></div>
      <button id="clearReply" type="button" class="secondary">Cancel reply</button>
    </div>
    <div class="row" id="refEventRow" style="display:none">
      <div id="refEventText" class="hint" style="margin:0"></div>
      <button id="clearRefEvent" type="button" class="secondary">Clear reference</button>
    </div>
    <div class="row" id="refNoteRow" style="display:none">
      <div id="refNoteText" class="hint" style="margin:0"></div>
      <button id="clearRefNote" type="button" class="secondary">Clear note ref</button>
    </div>
    <textarea id="input" dir="auto" placeholder="Message…"></textarea>
    <div id="mentionSuggestRow" class="mention-suggest-row"></div>
    <div class="row">
      <button id="send" type="button" disabled title="Type a non-empty message. Shift+Enter for newline, Enter to send.">Send</button>
      <button id="refresh" type="button" class="secondary">Refresh</button>
      <button id="btnOpenConversation" type="button" class="secondary" title="Open the main conversation panel (tree, thread, composer) for this conversation">Open conversation</button>
      <button id="btnRefreshConversationTree" type="button" class="secondary" title="Reload tree and thread in the open conversation panel, if any (Colcoor: Refresh conversation tree)">Refresh tree</button>
      <button id="btnCopySelectedMessage" type="button" class="secondary" title="Copy the selected tree message body (Colcoor: Copy selected message; conversation panel must be open)">Copy selection</button>
      <button id="btnContinueFromHere" type="button" class="secondary" title="Set active branch to the selected message (Colcoor: Continue from here; conversation panel must be open)">Continue here</button>
      <button id="btnResendAssistant" type="button" class="secondary" title="Regenerate assistant under the selected user message (Colcoor: Resend assistant; conversation panel must be open)">Resend</button>
      <button id="btnJumpToLatestInConversation" type="button" class="secondary" title="Select the newest leaf on the default branch (Colcoor: Jump to latest in conversation; conversation panel must be open)">Jump latest</button>
      <button id="btnOpenDrawers" type="button" class="secondary" title="Open the Starred/TODO drawers panel for this conversation">Drawers</button>
      <button id="btnListTodoNotes" type="button" class="secondary" title="Pick a TODO note and open its host message (Colcoor: List TODO notes in conversation…)">TODO notes…</button>
      <button id="btnListStarredMessages" type="button" class="secondary" title="Pick a starred message to open in the conversation panel (Colcoor: List starred messages in conversation…)">Starred…</button>
      <button id="btnProfile" type="button" class="secondary" title="Edit your Colcoor profile">Profile…</button>
      <button id="btnSettings" type="button" class="secondary" title="Open Colcoor extension settings">Settings</button>
      <button id="btnLegalPolicySettings" type="button" class="secondary" title="Open Colcoor Terms, Privacy, and Refund URL settings">Legal URLs…</button>
      <button id="btnSideChatSoundSettings" type="button" class="secondary" title="Open side chat notification and sound settings">Side chat sounds…</button>
      <button id="btnAbout" type="button" class="secondary" title="About Colcoor">About</button>
      <button id="btnSignIn" type="button" class="secondary" title="Sign in to Colcoor with your Cursor account">Sign in</button>
      <button id="btnNewConversation" type="button" class="secondary" title="Create a new conversation">New conversation</button>
      <button id="btnSignOut" type="button" class="secondary" title="Sign out from Colcoor">Sign out</button>
      <button id="btnRefreshConversations" type="button" class="secondary" title="Reload the Colcoor conversations list in the sidebar (Colcoor: Refresh conversations)">Refresh list</button>
      <button id="btnToggleConversationsSidebar" type="button" class="secondary" title="Show or hide the Colcoor Conversations sidebar (Colcoor: Toggle conversations sidebar)">Toggle sidebar</button>
      <button id="btnRenameConversation" type="button" class="secondary" title="Rename this conversation (Colcoor: Rename conversation) when your role allows">Rename conversation…</button>
      <button id="btnAddConversationMember" type="button" class="secondary" title="Invite an existing Colcoor user by UUID (Colcoor: Add member…)">Add member…</button>
      <button id="btnListConversationMembers" type="button" class="secondary" title="List members in the output channel (Colcoor: Show members)">Show members</button>
      <button id="btnChangeMemberRole" type="button" class="secondary" title="Pick a member and set a new role (Colcoor: Change member role…)">Change role…</button>
      <button id="btnRemoveMember" type="button" class="secondary" title="Remove a member from this conversation (Colcoor: Remove member…)">Remove member…</button>
      <button id="btnCopyConversationId" type="button" class="secondary" title="Copy this conversation UUID to the clipboard (Colcoor: Copy conversation ID)">Copy ID</button>
      <button id="btnTogglePinnedConversation" type="button" class="secondary" title="Pin or unpin this conversation in your sidebar list (Colcoor: Pin / unpin conversation)">Pin / unpin</button>
      <button id="btnDeleteConversation" type="button" class="secondary" title="Permanently delete this conversation from Colcoor (Colcoor: Delete conversation…). You will be asked to confirm.">Delete conversation…</button>
      <button id="btnSetupCursorCli" type="button" class="secondary" title="Set up the Cursor CLI for the Colcoor agent">CLI setup</button>
      <button id="btnSetCursorAgentApiKey" type="button" class="secondary" title="Store the Cursor API key used for the Colcoor agent">Agent API key</button>
    </div>
    <p id="err" class="err" style="display:none"></p>
  </div>
  <script nonce="${nonce}">
    ${SIDECHAT_AUTHOR_WEBVIEW_JS}
    const vscode = acquireVsCodeApi();
    const SIDECHAT_COMPOSER_HEIGHT_KEY = "colcoor.sideChatComposerTextareaHeightPx";
    var viewerUserId = null;
    var replyTarget = null;
    var referencedEventId = null;
    var referencedNoteId = null;
    var mentionUniverse = [];
    var mentionVisible = [];
    var audioCtx = null;
    function playTone(freq, durationMs, gainValue) {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.value = gainValue;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        setTimeout(function () {
          try { osc.stop(); } catch {}
          try { osc.disconnect(); } catch {}
          try { gain.disconnect(); } catch {}
        }, durationMs);
      } catch {
        /* audio unsupported */
      }
    }
    function playSideChatSound(kind) {
      if (kind === "mention") {
        playTone(880, 110, 0.06);
        setTimeout(function () { playTone(988, 120, 0.06); }, 120);
        return;
      }
      playTone(740, 120, 0.05);
    }
    function shouldSendOnEnter(ev) {
      if (!ev || ev.key !== "Enter") return false;
      if (ev.isComposing) return false;
      if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return false;
      return true;
    }
    function updateComposerSendEnabled() {
      var send = document.getElementById("send");
      var ta = document.getElementById("input");
      if (!send) return;
      var has = ta && String(ta.value || "").trim().length > 0;
      send.disabled = !has;
      send.title = has
        ? ""
        : "Type a non-empty message. Shift+Enter for newline, Enter to send.";
    }
    function clampComposerHeightPx(v) {
      var n = Math.floor(Number(v));
      if (!Number.isFinite(n)) return null;
      if (n < 64 || n > 520) return null;
      return n;
    }
    function applyComposerHeightFromLocalStorage() {
      var ta = document.getElementById("input");
      if (!ta) return;
      try {
        var raw = localStorage.getItem(SIDECHAT_COMPOSER_HEIGHT_KEY);
        var h = clampComposerHeightPx(raw);
        if (h != null) ta.style.height = h + "px";
      } catch {
        /* storage unavailable */
      }
    }
    function wireComposerHeightPersistence() {
      var ta = document.getElementById("input");
      if (!ta || typeof ResizeObserver === "undefined") return;
      var tid = null;
      var ro = new ResizeObserver(function () {
        if (tid) clearTimeout(tid);
        tid = setTimeout(function () {
          tid = null;
          var h = clampComposerHeightPx(ta.getBoundingClientRect().height);
          if (h == null) return;
          try {
            localStorage.setItem(SIDECHAT_COMPOSER_HEIGHT_KEY, String(h));
          } catch {
            /* storage unavailable */
          }
          vscode.postMessage({ type: "layout", composerTextareaHeightPx: h });
        }, 120);
      });
      ro.observe(ta);
    }
    function collectMentionUniverse(messages) {
      var seen = {};
      var out = [];
      (messages || []).forEach(function (m) {
        if (!m || !Array.isArray(m.mentions)) return;
        m.mentions.forEach(function (raw) {
          var h = String(raw || "").trim().toLowerCase();
          if (!h) return;
          if (seen[h]) return;
          seen[h] = true;
          out.push(h);
        });
      });
      return out;
    }
    function currentMentionQuery(text, caret) {
      var src = String(text || "");
      var i = typeof caret === "number" && caret >= 0 ? caret : src.length;
      var left = src.slice(0, i);
      var m = left.match(/(^|\\s)@([a-z0-9._-]{1,32})$/i);
      if (!m) return null;
      var q = String(m[2] || "").trim().toLowerCase();
      return q || null;
    }
    function applyMentionSuggestion(handle) {
      var ta = document.getElementById("input");
      if (!ta) return;
      var v = String(ta.value || "");
      var caret = typeof ta.selectionStart === "number" ? ta.selectionStart : v.length;
      var left = v.slice(0, caret);
      var right = v.slice(caret);
      var nextLeft = left.replace(/(^|\\s)@[a-z0-9._-]{1,32}$/i, function (all, ws) {
        return String(ws || "") + "@" + handle + " ";
      });
      ta.value = nextLeft + right;
      var pos = nextLeft.length;
      try {
        ta.setSelectionRange(pos, pos);
      } catch {}
      ta.focus();
      renderMentionSuggestions();
      updateComposerSendEnabled();
    }
    function renderMentionSuggestions() {
      var row = document.getElementById("mentionSuggestRow");
      var ta = document.getElementById("input");
      if (!row || !ta) return;
      var q = currentMentionQuery(ta.value, ta.selectionStart);
      if (!q) {
        row.style.display = "none";
        row.textContent = "";
        mentionVisible = [];
        return;
      }
      var picked = mentionUniverse.filter(function (h) { return h.indexOf(q) === 0; }).slice(0, 6);
      mentionVisible = picked;
      if (!picked.length) {
        row.style.display = "none";
        row.textContent = "";
        return;
      }
      row.style.display = "flex";
      row.textContent = "";
      picked.forEach(function (h) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "mention-suggest-chip";
        b.textContent = "@" + h;
        b.addEventListener("click", function () {
          applyMentionSuggestion(h);
        });
        row.appendChild(b);
      });
    }
    function canMutateRow(m) {
      return !!(viewerUserId && m && m.kind === "user" && m.author_user_id === viewerUserId && !m.deleted_at);
    }
    function endEdit(row, wrap, originalBodyText) {
      row.dataset.editing = "0";
      var body = document.createElement("div");
      body.className = "body";
      body.setAttribute("dir", "auto");
      body.textContent = (originalBodyText != null ? String(originalBodyText) : "") || "(empty)";
      if (wrap && wrap.parentNode) wrap.parentNode.replaceChild(body, wrap);
    }
    function startEdit(row, m) {
      if (row.dataset.editing === "1") return;
      row.dataset.editing = "1";
      var bodyEl = row.querySelector(".body");
      if (!bodyEl) return;
      var orig = m.body != null ? String(m.body) : "";
      var wrap = document.createElement("div");
      var ta = document.createElement("textarea");
      ta.className = "edit-ta";
      ta.setAttribute("dir", "auto");
      ta.value = orig;
      var rb = document.createElement("div");
      rb.className = "row";
      var save = document.createElement("button");
      save.type = "button";
      save.textContent = "Save";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "secondary";
      cancel.textContent = "Cancel";
      save.addEventListener("click", function () {
        vscode.postMessage({ type: "edit", messageId: m.id, text: ta.value });
      });
      cancel.addEventListener("click", function () {
        endEdit(row, wrap, m.body);
      });
      rb.appendChild(save);
      rb.appendChild(cancel);
      wrap.appendChild(ta);
      wrap.appendChild(rb);
      bodyEl.replaceWith(wrap);
    }
    function render(messages) {
      var list = document.getElementById("list");
      var err = document.getElementById("err");
      if (err) { err.style.display = "none"; err.textContent = ""; }
      if (!list) return;
      list.textContent = "";
      (messages || []).forEach(function (m) {
        var row = document.createElement("div");
        row.className = "msg";
        row.dataset.editing = "0";
        var meta = document.createElement("div");
        meta.className = "meta";
        var avUrl = sideChatHttpsAvatarUrl(m.author_avatar_url);
        if (avUrl) {
          var img = document.createElement("img");
          img.className = "msg-avatar";
          img.alt = "";
          img.loading = "lazy";
          img.referrerPolicy = "no-referrer";
          img.src = avUrl;
          meta.appendChild(img);
        }
        var metaText = document.createElement("span");
        metaText.textContent = sideChatMetaBase(m) + sideChatAuthorSuffix(m);
        meta.appendChild(metaText);
        if (Array.isArray(m.mentions) && m.mentions.length) {
          var mentions = document.createElement("span");
          mentions.className = "mentions";
          m.mentions.forEach(function (h) {
            var chip = document.createElement("span");
            chip.className = "mention-chip";
            chip.textContent = "@" + String(h);
            mentions.appendChild(chip);
          });
          meta.appendChild(mentions);
        }
        if (Array.isArray(m.reference_chips) && m.reference_chips.length) {
          var refs = document.createElement("span");
          refs.className = "refs";
          var refItems = [];
          if (m.referenced_event_id) refItems.push({ kind: "event", id: m.referenced_event_id });
          if (m.referenced_note_id) refItems.push({ kind: "note", id: m.referenced_note_id });
          if (m.referenced_side_chat_message_id) refItems.push({ kind: "reply", id: m.referenced_side_chat_message_id });
          m.reference_chips.forEach(function (r) {
            var chip2 = document.createElement("span");
            chip2.className = "ref-chip";
            chip2.textContent = String(r);
            var ri = refItems.shift();
            if (ri && (ri.kind === "event" || ri.kind === "note")) {
              chip2.dataset.refKind = ri.kind;
              chip2.dataset.refId = ri.id;
              chip2.title = ri.kind === "event" ? "Open referenced event" : "Copy referenced note ID";
            }
            refs.appendChild(chip2);
          });
          meta.appendChild(refs);
        }
        var body = document.createElement("div");
        body.className = "body";
        body.setAttribute("dir", "auto");
        body.innerHTML =
          typeof m.rendered_body_html === "string" && m.rendered_body_html.length
            ? m.rendered_body_html
            : ((m.body != null ? String(m.body) : "") || "(empty)");
        if (m.referenced_side_chat_preview && typeof m.referenced_side_chat_preview.seq === "number") {
          var ref = document.createElement("div");
          ref.className = "ref";
          ref.textContent =
            "↪ #" +
            m.referenced_side_chat_preview.seq +
            " " +
            (m.referenced_side_chat_preview.text || "(empty)");
          row.appendChild(ref);
        }
        row.appendChild(meta);
        row.appendChild(body);
        if (m.kind === "user" && !m.deleted_at) {
          var replyActions = document.createElement("div");
          replyActions.className = "row msg-actions";
          var btnReply = document.createElement("button");
          btnReply.type = "button";
          btnReply.className = "secondary";
          btnReply.textContent = "Reply";
          btnReply.addEventListener("click", function () {
            replyTarget = { id: m.id, seq: m.seq, text: (m.body != null ? String(m.body) : "") || "(empty)" };
            updateReplyHint();
          });
          replyActions.appendChild(btnReply);
          row.appendChild(replyActions);
        }
        if (canMutateRow(m)) {
          var actions = document.createElement("div");
          actions.className = "row msg-actions";
          var btnEdit = document.createElement("button");
          btnEdit.type = "button";
          btnEdit.className = "secondary";
          btnEdit.textContent = "Edit";
          btnEdit.addEventListener("click", function () { startEdit(row, m); });
          var btnDel = document.createElement("button");
          btnDel.type = "button";
          btnDel.className = "secondary";
          btnDel.textContent = "Delete";
          btnDel.addEventListener("click", function () {
            if (!confirm("Delete this side-chat message?")) return;
            vscode.postMessage({ type: "delete", messageId: m.id });
          });
          actions.appendChild(btnEdit);
          actions.appendChild(btnDel);
          row.appendChild(actions);
        }
        list.appendChild(row);
      });
    }
    function updateReplyHint() {
      var n = document.getElementById("replying");
      var row = document.getElementById("replyingRow");
      if (!n || !row) return;
      if (!replyTarget) {
        row.style.display = "none";
        n.textContent = "";
        return;
      }
      row.style.display = "flex";
      n.textContent = "Replying to #" + replyTarget.seq + " " + (replyTarget.text || "(empty)");
    }
    function updateRefEventHint() {
      var t = document.getElementById("refEventText");
      var row = document.getElementById("refEventRow");
      if (!t || !row) return;
      if (!referencedEventId) {
        row.style.display = "none";
        t.textContent = "";
        return;
      }
      row.style.display = "flex";
      t.textContent = "Referencing event " + String(referencedEventId).slice(0, 8);
    }
    function updateRefNoteHint() {
      var t = document.getElementById("refNoteText");
      var row = document.getElementById("refNoteRow");
      if (!t || !row) return;
      if (!referencedNoteId) {
        row.style.display = "none";
        t.textContent = "";
        return;
      }
      row.style.display = "flex";
      t.textContent = "Referencing note " + String(referencedNoteId).slice(0, 8);
    }
    window.addEventListener("message", function (ev) {
      var d = ev.data;
      if (d && d.type === "state") {
        if (typeof d.referencedEventId === "string" && d.referencedEventId) {
          referencedEventId = d.referencedEventId;
        } else if (d.referencedEventId === null) {
          referencedEventId = null;
        }
        if (typeof d.referencedNoteId === "string" && d.referencedNoteId) {
          referencedNoteId = d.referencedNoteId;
        } else if (d.referencedNoteId === null) {
          referencedNoteId = null;
        }
        if (typeof d.viewerUserId === "string") {
          viewerUserId = d.viewerUserId;
        } else if (d.viewerUserId === null) {
          viewerUserId = null;
        }
        if (typeof d.composerTextareaHeightPx === "number") {
          var taState = document.getElementById("input");
          var hFromHost = clampComposerHeightPx(d.composerTextareaHeightPx);
          if (taState && hFromHost != null) {
            taState.style.height = hFromHost + "px";
            try {
              localStorage.setItem(SIDECHAT_COMPOSER_HEIGHT_KEY, String(hFromHost));
            } catch {
              /* storage unavailable */
            }
          }
        }
        var sub = document.getElementById("sub");
        if (sub) {
          var countPart =
            d.messages && d.messages.length ? d.messages.length + " message(s)" : "No messages yet.";
          var presencePart =
            typeof d.presenceSummary === "string" && d.presenceSummary.trim()
              ? " · " + d.presenceSummary.trim()
              : "";
          sub.textContent = countPart + presencePart;
        }
        mentionUniverse = collectMentionUniverse(d.messages || []);
        updateRefEventHint();
        updateRefNoteHint();
        render(d.messages || []);
        renderMentionSuggestions();
      }
      if (d && d.type === "error" && typeof d.text === "string") {
        var err = document.getElementById("err");
        if (err) { err.style.display = "block"; err.textContent = d.text; }
      }
      if (d && d.type === "playSound" && (d.kind === "message" || d.kind === "mention")) {
        playSideChatSound(d.kind);
      }
    });
    document.getElementById("send").addEventListener("click", function () {
      var ta = document.getElementById("input");
      var t = ta && ta.value ? ta.value : "";
      if (!String(t).trim()) {
        return;
      }
      var refId = replyTarget && typeof replyTarget.id === "string" ? replyTarget.id : null;
      vscode.postMessage({
        type: "send",
        text: t,
        referencedSideChatMessageId: refId,
        referencedEventId: referencedEventId,
        referencedNoteId: referencedNoteId,
      });
      replyTarget = null;
      referencedEventId = null;
      referencedNoteId = null;
      updateReplyHint();
      updateRefEventHint();
      updateRefNoteHint();
      if (ta) ta.value = "";
      updateComposerSendEnabled();
    });
    document.getElementById("refresh").addEventListener("click", function () {
      vscode.postMessage({ type: "refresh" });
    });
    document.getElementById("btnOpenConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "openConversation" });
    });
    document.getElementById("btnRefreshConversationTree").addEventListener("click", function () {
      vscode.postMessage({ type: "refreshConversationTree" });
    });
    document.getElementById("btnCopySelectedMessage").addEventListener("click", function () {
      vscode.postMessage({ type: "copySelectedMessage" });
    });
    document.getElementById("btnContinueFromHere").addEventListener("click", function () {
      vscode.postMessage({ type: "continueFromHere" });
    });
    document.getElementById("btnResendAssistant").addEventListener("click", function () {
      vscode.postMessage({ type: "resendAssistant" });
    });
    document.getElementById("btnJumpToLatestInConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "jumpToLatestInConversation" });
    });
    document.getElementById("btnOpenDrawers").addEventListener("click", function () {
      vscode.postMessage({ type: "openDrawers" });
    });
    document.getElementById("btnListTodoNotes").addEventListener("click", function () {
      vscode.postMessage({ type: "listTodoNotesInConversation" });
    });
    document.getElementById("btnListStarredMessages").addEventListener("click", function () {
      vscode.postMessage({ type: "listStarredMessagesInConversation" });
    });
    document.getElementById("btnProfile").addEventListener("click", function () {
      vscode.postMessage({ type: "openProfile" });
    });
    document.getElementById("btnSettings").addEventListener("click", function () {
      vscode.postMessage({ type: "openSettings" });
    });
    document.getElementById("btnLegalPolicySettings").addEventListener("click", function () {
      vscode.postMessage({ type: "openLegalPolicySettings" });
    });
    document.getElementById("btnSideChatSoundSettings").addEventListener("click", function () {
      vscode.postMessage({ type: "openSideChatSoundSettings" });
    });
    document.getElementById("btnAbout").addEventListener("click", function () {
      vscode.postMessage({ type: "openAbout" });
    });
    document.getElementById("btnSignIn").addEventListener("click", function () {
      vscode.postMessage({ type: "signIn" });
    });
    document.getElementById("btnNewConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "newConversation" });
    });
    document.getElementById("btnSignOut").addEventListener("click", function () {
      vscode.postMessage({ type: "signOut" });
    });
    document.getElementById("btnRefreshConversations").addEventListener("click", function () {
      vscode.postMessage({ type: "refreshConversations" });
    });
    document.getElementById("btnToggleConversationsSidebar").addEventListener("click", function () {
      vscode.postMessage({ type: "toggleConversationsSidebar" });
    });
    document.getElementById("btnRenameConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "renameConversation" });
    });
    document.getElementById("btnAddConversationMember").addEventListener("click", function () {
      vscode.postMessage({ type: "addConversationMember" });
    });
    document.getElementById("btnListConversationMembers").addEventListener("click", function () {
      vscode.postMessage({ type: "listConversationMembers" });
    });
    document.getElementById("btnChangeMemberRole").addEventListener("click", function () {
      vscode.postMessage({ type: "changeMemberRole" });
    });
    document.getElementById("btnRemoveMember").addEventListener("click", function () {
      vscode.postMessage({ type: "removeMember" });
    });
    document.getElementById("btnCopyConversationId").addEventListener("click", function () {
      vscode.postMessage({ type: "copyConversationId" });
    });
    document.getElementById("btnTogglePinnedConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "togglePinnedConversation" });
    });
    document.getElementById("btnDeleteConversation").addEventListener("click", function () {
      vscode.postMessage({ type: "deleteConversation" });
    });
    document.getElementById("btnSetupCursorCli").addEventListener("click", function () {
      vscode.postMessage({ type: "setupCursorCli" });
    });
    document.getElementById("btnSetCursorAgentApiKey").addEventListener("click", function () {
      vscode.postMessage({ type: "setCursorAgentApiKey" });
    });
    document.addEventListener("click", function (ev) {
      var tgt = ev.target;
      if (!tgt || typeof tgt.closest !== "function") return;
      var pbtn = tgt.closest("button.policy");
      if (pbtn) {
        var u = pbtn.getAttribute("data-url");
        if (u) vscode.postMessage({ type: "openLegalPolicyUrl", url: u });
        return;
      }
      var refChip = tgt.closest(".ref-chip");
      if (refChip && refChip.dataset && refChip.dataset.refKind && refChip.dataset.refId) {
        if (refChip.dataset.refKind === "event" || refChip.dataset.refKind === "note") {
          vscode.postMessage({
            type: "openReference",
            refKind: refChip.dataset.refKind,
            refId: refChip.dataset.refId,
          });
          return;
        }
      }
      var btn = tgt.closest(".code-copy");
      if (!btn) return;
      var wrap = btn.closest(".code-block-wrap");
      if (!wrap) return;
      var code = wrap.querySelector("pre code");
      if (!code || typeof code.textContent !== "string") return;
      var text = code.textContent;
      if (!text) return;
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return;
      navigator.clipboard.writeText(text).catch(function () {
        var err = document.getElementById("err");
        if (err) {
          err.style.display = "block";
          err.textContent = "Failed to copy code block.";
        }
      });
    });
    document.getElementById("input").addEventListener("input", function () {
      updateComposerSendEnabled();
      renderMentionSuggestions();
    });
    document.getElementById("input").addEventListener("keydown", function (ev) {
      if (ev.key === "Tab" && mentionVisible.length > 0) {
        ev.preventDefault();
        applyMentionSuggestion(mentionVisible[0]);
        return;
      }
      if (!shouldSendOnEnter(ev)) return;
      var send = document.getElementById("send");
      if (send && send.disabled) return;
      ev.preventDefault();
      if (send) send.click();
    });
    document.getElementById("clearReply").addEventListener("click", function () {
      replyTarget = null;
      updateReplyHint();
    });
    document.getElementById("clearRefEvent").addEventListener("click", function () {
      referencedEventId = null;
      updateRefEventHint();
    });
    document.getElementById("clearRefNote").addEventListener("click", function () {
      referencedNoteId = null;
      updateRefNoteHint();
    });
    applyComposerHeightFromLocalStorage();
    wireComposerHeightPersistence();
    updateComposerSendEnabled();
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}
