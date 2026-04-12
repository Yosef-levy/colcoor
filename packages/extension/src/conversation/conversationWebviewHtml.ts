/** HTML document for the Colcoor conversation webview (tree + thread + composer). */

export function getConversationWebviewHtml(cspSource: string, nonce: string): string {
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
  <title>Colcoor</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    h1 { font-size: 1.1em; font-weight: 600; margin: 0 0 8px; }
    .layout { display: flex; gap: 12px; align-items: stretch; min-height: calc(100vh - 24px); }
    .col-tree {
      flex: 0 0 38%;
      min-width: 160px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      overflow: auto;
    }
    .col-main { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 10px; }
    .detail-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      background: var(--vscode-sideBar-background);
    }
    .detail-bar .crumb {
      flex: 1;
      min-width: 140px;
      line-height: 1.45;
      font-size: 0.92em;
    }
    .detail-bar .detail-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .crumb-step strong { font-weight: 600; color: var(--vscode-foreground); }
    .crumb-sep { color: var(--vscode-descriptionForeground); margin: 0 4px; }
    .thread {
      flex: 1;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      overflow: auto;
    }
    .composer {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
    }
    .composer textarea {
      width: 100%;
      min-height: 72px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      padding: 6px;
    }
    .composer .row { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
    button {
      font-family: var(--vscode-font-family);
      padding: 6px 14px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
    }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    .hint { color: var(--vscode-descriptionForeground); font-size: 0.92em; }
    .err {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .tree ul { list-style: none; margin: 0; padding-left: 14px; }
    .tree li { margin: 2px 0; }
    .node {
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 3px;
      border: 1px solid transparent;
      font-size: 0.95em;
    }
    .node:hover { background: var(--vscode-list-hoverBackground); }
    .node.selected {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-inactiveSelectionBackground);
    }
    .node .meta { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
    .msg { margin: 8px 0; padding: 8px; border-radius: 4px; border-left: 3px solid var(--vscode-focusBorder); }
    .msg.user { background: var(--vscode-editor-inactiveSelectionBackground); }
    .msg.assistant { background: var(--vscode-textBlockQuote-background); }
    .msg.assistant.streaming { box-shadow: inset 0 0 0 1px var(--vscode-focusBorder, var(--vscode-panel-border)); }
    .msg .role { font-size: 0.8em; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
    /* Thread bodies: GFM markdown from host (sanitized HTML). */
    .thread .msg .body.md {
      white-space: normal;
      word-break: break-word;
      line-height: 1.58;
      font-size: var(--vscode-editor-font-size, var(--vscode-font-size));
      color: var(--vscode-editor-foreground, var(--vscode-foreground));
    }
    .thread .msg .body.md > *:first-child { margin-top: 0; }
    .thread .msg .body.md > *:last-child { margin-bottom: 0; }
    .thread .msg .body.md h1, .thread .msg .body.md h2, .thread .msg .body.md h3,
    .thread .msg .body.md h4, .thread .msg .body.md h5, .thread .msg .body.md h6 {
      font-weight: 600;
      line-height: 1.28;
      margin: 0.65em 0 0.4em;
      color: var(--vscode-foreground);
    }
    .thread .msg .body.md h1 { font-size: 1.2em; }
    .thread .msg .body.md h2 { font-size: 1.12em; }
    .thread .msg .body.md h3 { font-size: 1.06em; }
    .thread .msg .body.md h4, .thread .msg .body.md h5, .thread .msg .body.md h6 { font-size: 1.02em; }
    .thread .msg .body.md p { margin: 0.45em 0; }
    .thread .msg .body.md strong { font-weight: 600; }
    .thread .msg .body.md a {
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .thread .msg .body.md a:hover { color: var(--vscode-textLink-activeForeground); }
    .thread .msg .body.md pre {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0.55em 0;
      padding: 10px 12px;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: calc(var(--vscode-editor-font-size, 13px) * 0.95);
    }
    .thread .msg .body.md code {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.92em;
    }
    .thread .msg .body.md :not(pre) > code {
      padding: 0.12em 0.4em;
      border-radius: 4px;
      background: var(--vscode-textPreformat-background, var(--vscode-textCodeBlock-background));
      color: var(--vscode-textPreformat-foreground, var(--vscode-foreground));
    }
    .thread .msg .body.md pre code {
      background: transparent;
      padding: 0;
      font-size: inherit;
      color: inherit;
    }
    .thread .msg .body.md ul, .thread .msg .body.md ol {
      margin: 0.45em 0;
      padding-left: 1.35em;
    }
    .thread .msg .body.md li { margin: 0.2em 0; }
    .thread .msg .body.md ul.contains-task-list,
    .thread .msg .body.md ol.contains-task-list { padding-left: 1.5em; }
    .thread .msg .body.md li.task-list-item { list-style-type: none; margin-left: -1.1em; }
    .thread .msg .body.md li.task-list-item input[type="checkbox"] {
      margin-right: 0.45em;
      vertical-align: middle;
    }
    .thread .msg .body.md table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.55em 0;
      font-size: 0.96em;
    }
    .thread .msg .body.md th, .thread .msg .body.md td {
      border: 1px solid var(--vscode-panel-border);
      padding: 6px 8px;
      text-align: left;
    }
    .thread .msg .body.md th { background: var(--vscode-editor-inactiveSelectionBackground); font-weight: 600; }
    .thread .msg .body.md blockquote {
      margin: 0.5em 0;
      padding: 0.35em 0 0.35em 12px;
      border-left: 3px solid var(--vscode-textBlockQuote-border, var(--vscode-focusBorder));
      color: var(--vscode-textBlockQuote-foreground, var(--vscode-descriptionForeground));
      background: var(--vscode-textBlockQuote-background);
      border-radius: 0 4px 4px 0;
    }
    .thread .msg .body.md hr {
      border: 0;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 0.85em 0;
    }
    .thread .msg .body.md img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 0.35em 0;
    }
    .composer label.priv { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
    .composer label.priv input { cursor: pointer; }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
  </style>
</head>
<body>
  <div id="err" class="err" style="display:none"></div>
  <h1 id="title">Colcoor</h1>
  <p class="hint" id="sub">Loading…</p>
  <div class="layout">
    <div class="col-tree">
      <div class="hint" style="margin-bottom:6px">Event tree — click a node to choose where the next message attaches.</div>
      <div id="tree" class="tree"></div>
    </div>
    <div class="col-main">
      <div class="detail-bar">
        <div id="breadcrumb" class="crumb hint"></div>
        <div class="detail-actions">
          <button type="button" id="btnRename" class="btn-secondary">Rename…</button>
          <button type="button" id="btnPin" class="btn-secondary">Pin</button>
          <button type="button" id="btnCopy" class="btn-secondary">Copy message</button>
          <button type="button" id="btnResend" class="btn-secondary">Resend assistant</button>
        </div>
      </div>
      <div class="thread">
        <div class="hint" style="margin-bottom:6px">Thread (root → selected)</div>
        <div id="thread"></div>
      </div>
      <div class="composer">
        <textarea id="input" placeholder="Message… Shift+Enter for newline, Enter to send"></textarea>
        <label class="priv hint" style="margin-top:6px;display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="privateBranch" />
          Private draft (only you see this user message until you continue on a shared branch)
        </label>
        <div class="row">
          <button id="send" type="button">Send</button>
          <button id="stop" type="button" class="btn-secondary" disabled>Stop</button>
          <button id="refresh" type="button">Refresh tree</button>
          <span class="hint" id="busy" style="display:none">Working…</span>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = {
      conversationId: "",
      title: null,
      conversationPinned: false,
      events: [],
      selectedEventId: "",
      threadSegments: [],
      busy: false,
      lastError: null,
      // Sanitized HTML for in-flight assistant text; cleared when the host sends a full state snapshot.
      streamingHtml: null,
    };

    function esc(s) {
      return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function snippet(ev) {
      const t = (ev.content_text || "").trim().replace(/\\s+/g, " ");
      if (!t) return "(empty)";
      return t.length > 96 ? t.slice(0, 96) + "…" : t;
    }

    function pathChain(events, selectedId) {
      const byId = Object.fromEntries(events.map((e) => [e.id, e]));
      const chain = [];
      let id = selectedId;
      const seen = new Set();
      while (id && !seen.has(id)) {
        seen.add(id);
        const ev = byId[id];
        if (!ev) break;
        chain.push(ev);
        id = ev.parent_event_id;
      }
      return chain.reverse();
    }

    function renderDetailBar() {
      const crumb = document.getElementById("breadcrumb");
      const copyBtn = document.getElementById("btnCopy");
      const resendBtn = document.getElementById("btnResend");
      if (!crumb || !copyBtn || !resendBtn) return;
      const sel = state.selectedEventId;
      const evs = state.events || [];
      const path = pathChain(evs, sel);
      if (!path.length) {
        crumb.innerHTML = '<span class="empty">No selection</span>';
        copyBtn.disabled = true;
        resendBtn.disabled = true;
        const renameBtn = document.getElementById("btnRename");
        const pinBtn = document.getElementById("btnPin");
        if (renameBtn) renameBtn.disabled = state.busy;
        if (pinBtn) {
          pinBtn.disabled = state.busy;
          pinBtn.textContent = state.conversationPinned ? "Unpin" : "Pin";
        }
        return;
      }
      const parts = path.map((ev) => {
        const lab = ev.kind === "user_input" ? "User" : "Assistant";
        return (
          '<span class="crumb-step"><strong>' +
          esc(lab) +
          "</strong> · " +
          esc(snippet(ev)) +
          "</span>"
        );
      });
      crumb.innerHTML = parts.join(' <span class="crumb-sep">→</span> ');
      const last = path[path.length - 1];
      copyBtn.disabled = state.busy;
      const canResend =
        last.kind === "user_input" && String(last.content_text || "").trim().length > 0;
      resendBtn.disabled = state.busy || !canResend;
      resendBtn.title = canResend
        ? "New assistant reply for this user message (same user row; transcript per docs)."
        : "Pick a user message with text (not the empty root placeholder).";
      const renameBtn = document.getElementById("btnRename");
      const pinBtn = document.getElementById("btnPin");
      if (renameBtn) renameBtn.disabled = state.busy;
      if (pinBtn) {
        pinBtn.disabled = state.busy;
        pinBtn.textContent = state.conversationPinned ? "Unpin" : "Pin";
      }
    }

    function renderTree() {
      const root = document.getElementById("tree");
      if (!root) return;
      const evs = state.events;
      if (!evs.length) {
        root.innerHTML = '<p class="empty">No events yet.</p>';
        return;
      }
      const byParent = new Map();
      for (const e of evs) {
        const k = e.parent_event_id == null ? "__root__" : e.parent_event_id;
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k).push(e);
      }
      for (const arr of byParent.values()) {
        arr.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      }
      function walk(parentKey) {
        const kids = byParent.get(parentKey) || [];
        if (!kids.length) return "";
        let html = "<ul>";
        for (const e of kids) {
          const sel = e.id === state.selectedEventId ? " selected" : "";
          const kind = esc(e.kind);
          html +=
            '<li><div class="node' +
            sel +
            '" data-id="' +
            esc(e.id) +
            '">' +
            '<span class="meta">' +
            kind +
            "</span> " +
            esc(snippet(e)) +
            "</div>";
          html += walk(e.id);
          html += "</li>";
        }
        html += "</ul>";
        return html;
      }
      root.innerHTML = walk("__root__");
      root.querySelectorAll(".node").forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.getAttribute("data-id");
          if (id) vscode.postMessage({ type: "select", id });
        });
      });
    }

    function renderThread() {
      const el = document.getElementById("thread");
      if (!el) return;
      const segs = state.threadSegments || [];
      if (!segs.length) {
        el.innerHTML = '<p class="empty">Select an event in the tree.</p>';
        return;
      }
      let html = "";
      for (const s of segs) {
        const cls = s.role === "user" ? "user" : "assistant";
        const role = s.role === "user" ? "User" : "Assistant";
        html +=
          '<div class="msg ' +
          cls +
          '"><div class="role">' +
          role +
          '</div><div class="body md">' +
          s.html +
          "</div></div>";
      }
      if (state.streamingHtml) {
        html +=
          '<div class="msg assistant streaming"><div class="role">Assistant</div><div class="body md">' +
          state.streamingHtml +
          "</div></div>";
      }
      el.innerHTML = html || '<p class="empty">Nothing to show on this path.</p>';
    }

    function render() {
      const errEl = document.getElementById("err");
      const titleEl = document.getElementById("title");
      const subEl = document.getElementById("sub");
      const sendBtn = document.getElementById("send");
      const stopBtn = document.getElementById("stop");
      const refBtn = document.getElementById("refresh");
      const ta = document.getElementById("input");
      const priv = document.getElementById("privateBranch");
      const busyEl = document.getElementById("busy");
      if (state.lastError && errEl) {
        errEl.style.display = "block";
        errEl.textContent = state.lastError;
      } else if (errEl) {
        errEl.style.display = "none";
        errEl.textContent = "";
      }
      if (titleEl) titleEl.textContent = state.title && state.title.trim() ? state.title : "(untitled)";
      if (subEl) {
        subEl.textContent =
          state.events.length +
          " event(s) — reply attaches under the selected tree node.";
      }
      if (sendBtn) sendBtn.disabled = state.busy;
      if (stopBtn) stopBtn.disabled = !state.busy;
      if (refBtn) refBtn.disabled = state.busy;
      if (ta) ta.disabled = state.busy;
      if (priv) priv.disabled = state.busy;
      if (busyEl) busyEl.style.display = state.busy ? "inline" : "none";
      renderTree();
      renderThread();
      renderDetailBar();
    }

    window.addEventListener("message", (event) => {
      const m = event.data;
      if (m && m.type === "state") {
        state = { ...m, streamingHtml: null };
        render();
        return;
      }
      if (m && m.type === "assistantStream" && typeof m.html === "string") {
        state = { ...state, streamingHtml: m.html || null };
        renderThread();
      }
    });

    document.getElementById("send").addEventListener("click", () => {
      const ta = document.getElementById("input");
      const text = ta && ta.value ? ta.value.trim() : "";
      if (!text) return;
      const priv = document.getElementById("privateBranch");
      const privateBranch = priv && priv.checked;
      vscode.postMessage({ type: "send", text: ta.value.trimEnd(), privateBranch });
      ta.value = "";
    });

    document.getElementById("stop").addEventListener("click", () => {
      vscode.postMessage({ type: "cancel" });
    });

    document.getElementById("refresh").addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });

    document.getElementById("btnCopy").addEventListener("click", () => {
      const ev = (state.events || []).find((e) => e.id === state.selectedEventId);
      if (!ev) return;
      vscode.postMessage({ type: "copy", text: ev.content_text || "" });
    });

    document.getElementById("btnResend").addEventListener("click", () => {
      vscode.postMessage({ type: "resend" });
    });

    document.getElementById("btnRename").addEventListener("click", () => {
      vscode.postMessage({ type: "rename" });
    });

    document.getElementById("btnPin").addEventListener("click", () => {
      vscode.postMessage({ type: "togglePin" });
    });

    document.getElementById("input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        document.getElementById("send").click();
      }
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}
