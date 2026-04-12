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
    .msg .role { font-size: 0.8em; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .msg .body { white-space: pre-wrap; word-break: break-word; }
    .msg .body.md { white-space: normal; }
    .msg .body.md pre {
      white-space: pre-wrap;
      word-break: break-word;
      padding: 8px;
      border-radius: 4px;
      background: var(--vscode-textCodeBlock-background);
      overflow-x: auto;
    }
    .msg .body.md code { font-family: var(--vscode-editor-font-family); font-size: 0.95em; }
    .msg .body.md p { margin: 0.35em 0; }
    .msg .body.md p:first-child { margin-top: 0; }
    .msg .body.md p:last-child { margin-bottom: 0; }
    .msg .body.md ul, .msg .body.md ol { margin: 0.35em 0; padding-left: 1.25em; }
    .msg .body.md table { border-collapse: collapse; width: 100%; margin: 0.5em 0; font-size: 0.95em; }
    .msg .body.md th, .msg .body.md td { border: 1px solid var(--vscode-panel-border); padding: 4px 6px; }
    .msg .body.md blockquote {
      margin: 0.35em 0;
      padding-left: 8px;
      border-left: 3px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
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
      events: [],
      selectedEventId: "",
      threadSegments: [],
      busy: false,
      lastError: null,
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
    }

    window.addEventListener("message", (event) => {
      const m = event.data;
      if (m && m.type === "state") {
        state = m;
        render();
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
