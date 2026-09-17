function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function getTemplateManagerPanelHtml(cspSource: string, nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeHtml(nonce)}';" />
  <title>Conversation templates</title>
  <style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 16px; }
    .layout { display: grid; grid-template-columns: minmax(190px, 28%) 1fr; gap: 16px; min-height: 70vh; }
    .toolbar, .editor-actions, .note-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    button, input, textarea { font: inherit; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 6px 10px; cursor: pointer; }
    button.secondary { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
    button:disabled { opacity: .55; cursor: default; }
    .template-list { border: 1px solid var(--vscode-panel-border); }
    .template-row { display: block; width: 100%; text-align: left; color: var(--vscode-foreground); background: transparent; border-bottom: 1px solid var(--vscode-panel-border); padding: 9px; }
    .template-row.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .badge { opacity: .75; font-size: .85em; }
    label { display: block; margin: 10px 0 4px; }
    input, textarea { box-sizing: border-box; width: 100%; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 7px; }
    textarea { min-height: 74px; resize: vertical; }
    .note { border: 1px solid var(--vscode-panel-border); padding: 10px; margin: 8px 0; }
    .note-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
    .muted { color: var(--vscode-descriptionForeground); }
    #error { color: var(--vscode-errorForeground); min-height: 1.3em; }
  </style>
</head>
<body>
  <h1>Conversation templates</h1>
  <p class="muted">Built-ins are read-only. Duplicate one to customize it. Custom templates are stored on this device and shared across workspaces.</p>
  <div class="toolbar">
    <button id="newTemplate">New template</button>
    <button id="duplicateTemplate" class="secondary">Duplicate</button>
    <button id="importTemplates" class="secondary">Import JSON…</button>
    <button id="exportTemplates" class="secondary">Export JSON…</button>
  </div>
  <div id="error" role="alert"></div>
  <div class="layout">
    <div id="templateList" class="template-list"></div>
    <main>
      <div id="empty" class="muted">Select a template.</div>
      <form id="editor" hidden>
        <div class="editor-actions">
          <button id="saveTemplate" type="submit">Save</button>
          <button id="deleteTemplate" type="button" class="secondary">Delete</button>
        </div>
        <label for="name">Name</label>
        <input id="name" maxlength="120" required />
        <label for="description">Description</label>
        <textarea id="description" maxlength="500"></textarea>
        <h2>Root notes</h2>
        <div id="notes"></div>
        <button id="addNote" type="button" class="secondary">Add note</button>
      </form>
    </main>
  </div>
  <script nonce="${escapeHtml(nonce)}">
    const vscode = acquireVsCodeApi();
    let templates = [];
    let selectedId = null;

    const listEl = document.getElementById("templateList");
    const editor = document.getElementById("editor");
    const empty = document.getElementById("empty");
    const nameInput = document.getElementById("name");
    const descriptionInput = document.getElementById("description");
    const notesEl = document.getElementById("notes");
    const errorEl = document.getElementById("error");
    const deleteButton = document.getElementById("deleteTemplate");
    const saveButton = document.getElementById("saveTemplate");
    const addNoteButton = document.getElementById("addNote");

    function selected() { return templates.find((row) => row.id === selectedId); }
    function post(type, extra) { vscode.postMessage(Object.assign({ type }, extra || {})); }
    function setError(message) { errorEl.textContent = message || ""; }

    function renderList() {
      listEl.replaceChildren();
      templates.forEach((template) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "template-row" + (template.id === selectedId ? " active" : "");
        button.textContent = template.name;
        if (template.builtIn) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = "  Built-in";
          button.appendChild(badge);
        }
        button.addEventListener("click", () => { selectedId = template.id; render(); });
        listEl.appendChild(button);
      });
    }

    function addNoteEditor(value) {
      const wrapper = document.createElement("div");
      wrapper.className = "note";
      const head = document.createElement("div");
      head.className = "note-head";
      const label = document.createElement("strong");
      label.textContent = "Note " + (notesEl.children.length + 1);
      const actions = document.createElement("div");
      actions.className = "note-actions";
      ["Up", "Down", "Remove"].forEach((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.textContent = action;
        button.addEventListener("click", () => {
          if (action === "Remove") wrapper.remove();
          if (action === "Up" && wrapper.previousElementSibling) notesEl.insertBefore(wrapper, wrapper.previousElementSibling);
          if (action === "Down" && wrapper.nextElementSibling) notesEl.insertBefore(wrapper.nextElementSibling, wrapper);
          renumberNotes();
        });
        actions.appendChild(button);
      });
      const textarea = document.createElement("textarea");
      textarea.maxLength = 12000;
      textarea.required = true;
      textarea.value = value || "";
      head.append(label, actions);
      wrapper.append(head, textarea);
      notesEl.appendChild(wrapper);
    }

    function renumberNotes() {
      Array.from(notesEl.children).forEach((row, index) => {
        row.querySelector("strong").textContent = "Note " + (index + 1);
      });
    }

    function renderEditor() {
      const template = selected();
      empty.hidden = Boolean(template);
      editor.hidden = !template;
      if (!template) return;
      nameInput.value = template.name;
      descriptionInput.value = template.description || "";
      nameInput.disabled = template.builtIn;
      descriptionInput.disabled = template.builtIn;
      saveButton.disabled = template.builtIn;
      deleteButton.disabled = template.builtIn;
      addNoteButton.disabled = template.builtIn;
      notesEl.replaceChildren();
      template.notes.forEach(addNoteEditor);
      notesEl.querySelectorAll("textarea, button").forEach((control) => { control.disabled = template.builtIn; });
    }

    function render() { renderList(); renderEditor(); }

    editor.addEventListener("submit", (event) => {
      event.preventDefault();
      const template = selected();
      if (!template || template.builtIn) return;
      const notes = Array.from(notesEl.querySelectorAll("textarea")).map((el) => el.value);
      post("save", { template: { id: template.id, name: nameInput.value, description: descriptionInput.value, notes } });
    });
    addNoteButton.addEventListener("click", () => addNoteEditor(""));
    deleteButton.addEventListener("click", () => { const row = selected(); if (row) post("delete", { id: row.id }); });
    document.getElementById("newTemplate").addEventListener("click", () => post("new"));
    document.getElementById("duplicateTemplate").addEventListener("click", () => { const row = selected(); if (row) post("duplicate", { id: row.id }); });
    document.getElementById("importTemplates").addEventListener("click", () => post("import"));
    document.getElementById("exportTemplates").addEventListener("click", () => post("export"));

    window.addEventListener("message", (event) => {
      const message = event.data || {};
      if (message.type === "templates") {
        templates = message.templates || [];
        selectedId = message.selectedId || selectedId || (templates[0] && templates[0].id);
        setError("");
        render();
      } else if (message.type === "error") {
        setError(message.message);
      }
    });
    post("ready");
  </script>
</body>
</html>`;
}
