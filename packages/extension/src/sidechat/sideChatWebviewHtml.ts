/** Minimal side-chat webview (list + send + refresh + markdown rendering). */

export function getSideChatWebviewHtml(cspSource: string, nonce: string): string {
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} https: data:`,
    `font-src ${cspSource}`,
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

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
    .msg .meta { font-size: 0.88em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .msg .mentions { display: inline-flex; gap: 6px; margin-left: 8px; flex-wrap: wrap; }
    .msg .mention-chip {
      padding: 1px 6px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editor-background);
      font-size: 0.92em;
    }
    .msg .body { white-space: pre-wrap; word-break: break-word; }
    .msg .ref {
      border-left: 2px solid var(--vscode-panel-border);
      margin: 0 0 6px;
      padding: 4px 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
      white-space: pre-wrap;
      word-break: break-word;
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
    .err { color: var(--vscode-errorForeground); font-size: 0.92em; }
  </style>
</head>
<body>
  <h1 id="title">Side chat</h1>
  <p class="hint" id="sub">Loading…</p>
  <div id="list"></div>
  <div class="composer">
    <div class="row" id="replyingRow" style="display:none">
      <div id="replying" class="hint" style="margin:0"></div>
      <button id="clearReply" type="button" class="secondary">Cancel reply</button>
    </div>
    <textarea id="input" placeholder="Message…"></textarea>
    <div class="row">
      <button id="send" type="button">Send</button>
      <button id="refresh" type="button" class="secondary">Refresh</button>
    </div>
    <p id="err" class="err" style="display:none"></p>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    var viewerUserId = null;
    var replyTarget = null;
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
    function canMutateRow(m) {
      return !!(viewerUserId && m && m.kind === "user" && m.author_user_id === viewerUserId && !m.deleted_at);
    }
    function endEdit(row, wrap, originalBodyText) {
      row.dataset.editing = "0";
      var body = document.createElement("div");
      body.className = "body";
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
        var del = m.deleted_at ? " · deleted" : "";
        meta.textContent = "#" + m.seq + " · " + (m.kind || "") + del;
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
        var body = document.createElement("div");
        body.className = "body";
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
    window.addEventListener("message", function (ev) {
      var d = ev.data;
      if (d && d.type === "state") {
        if (typeof d.viewerUserId === "string") {
          viewerUserId = d.viewerUserId;
        } else if (d.viewerUserId === null) {
          viewerUserId = null;
        }
        var sub = document.getElementById("sub");
        if (sub) sub.textContent = (d.messages && d.messages.length) ? d.messages.length + " message(s)" : "No messages yet.";
        render(d.messages || []);
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
      var refId = replyTarget && typeof replyTarget.id === "string" ? replyTarget.id : null;
      vscode.postMessage({ type: "send", text: t, referencedSideChatMessageId: refId });
      replyTarget = null;
      updateReplyHint();
      if (ta) ta.value = "";
    });
    document.getElementById("refresh").addEventListener("click", function () {
      vscode.postMessage({ type: "refresh" });
    });
    document.addEventListener("click", function (ev) {
      var tgt = ev.target;
      if (!tgt || typeof tgt.closest !== "function") return;
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
    document.getElementById("input").addEventListener("keydown", function (ev) {
      if (!shouldSendOnEnter(ev)) return;
      ev.preventDefault();
      document.getElementById("send").click();
    });
    document.getElementById("clearReply").addEventListener("click", function () {
      replyTarget = null;
      updateReplyHint();
    });
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}
