/** HTML document for the Colcoor conversation webview (tree + thread + composer). */

import {
  PRIVATE_BRANCH_DESCRIPTION,
  PRIVATE_BRANCH_LABEL_TITLE,
  PRIVATE_BRANCH_LEAD,
} from "./privateBranchComposerCopy";

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
    html,
    body {
      height: 100%;
      margin: 0;
    }
    body {
      padding: 12px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
    h1 {
      font-size: 1.1em;
      font-weight: 600;
      margin: 0 0 8px;
      flex-shrink: 0;
    }
    #sub {
      flex-shrink: 0;
    }
    .layout {
      flex: 1;
      min-height: 0;
      display: flex;
      gap: 12px;
      align-items: stretch;
      overflow: hidden;
    }
    .col-tree {
      flex: 0 0 auto;
      width: 38%;
      min-width: 140px;
      max-width: 80%;
      resize: horizontal;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }
    .tree-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .col-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      gap: 10px;
      overflow: hidden;
    }
    .detail-bar {
      flex-shrink: 0;
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
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      overflow: hidden;
    }
    .thread-hint {
      flex-shrink: 0;
      margin-bottom: 6px;
    }
    .thread-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .composer {
      flex-shrink: 0;
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
      flex-shrink: 0;
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .tree-panel-hint {
      flex-shrink: 0;
      margin-bottom: 10px;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
      line-height: 1.45;
    }
    .tree > ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .tree-branch {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .tree-branch > ul {
      list-style: none;
      margin: 6px 0 0 0;
      padding: 0 0 4px 14px;
      border-left: 2px solid
        var(
          --vscode-tree-indentGuidesStroke,
          var(--vscode-editorIndentGuide-background, var(--vscode-panel-border))
        );
    }
    .tree-row {
      display: flex;
      align-items: stretch;
      gap: 2px;
      min-width: 0;
    }
    .tree-expand {
      flex: 0 0 22px;
      width: 22px;
      min-height: 100%;
      align-self: stretch;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 10px 0 0;
      margin: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 0.65em;
      line-height: 1;
      cursor: pointer;
    }
    .tree-expand:hover {
      color: var(--vscode-foreground);
      background: var(--vscode-toolbar-hoverBackground, rgba(127, 127, 127, 0.15));
    }
    .tree-expand-spacer {
      flex: 0 0 22px;
      width: 22px;
    }
    .node {
      flex: 1;
      min-width: 0;
      cursor: pointer;
      border-radius: 8px;
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(127, 127, 127, 0.07));
      font-size: 0.95em;
      transition: background 0.1s ease, border-color 0.1s ease, box-shadow 0.1s ease;
    }
    .node:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder, var(--vscode-panel-border));
    }
    .node.selected {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-inactiveSelectionBackground);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder, transparent);
    }
    .node-inner {
      padding: 8px 10px 9px;
      min-width: 0;
    }
    .node-head {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px 8px;
      margin-bottom: 5px;
    }
    .node-role {
      display: inline-block;
      font-size: 0.68em;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid transparent;
    }
    .role-user .node-role {
      color: var(--vscode-gitDecoration-untrackedResourceForeground, #569cd6);
      background: rgba(86, 156, 214, 0.14);
      border-color: rgba(86, 156, 214, 0.32);
    }
    .role-assistant .node-role {
      color: var(--vscode-gitDecoration-submoduleResourceForeground, #c4a000);
      background: rgba(200, 170, 40, 0.16);
      border-color: rgba(200, 170, 40, 0.35);
    }
    .role-other .node-role {
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
      border-color: var(--vscode-panel-border);
    }
    .node .badge-pvt {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 0.65em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-inputValidation-infoForeground);
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
    }
    .node .when {
      font-size: 0.76em;
      color: var(--vscode-descriptionForeground);
    }
    .node-snippet {
      font-size: 0.86em;
      line-height: 1.42;
      color: var(--vscode-foreground);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
      unicode-bidi: plaintext;
    }
    .node-snippet-empty {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .node-title {
      font-size: 0.82em;
      font-weight: 600;
      color: var(--vscode-foreground);
      line-height: 1.35;
      margin-bottom: 3px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    .node-icons {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      margin-left: auto;
    }
    .node-icon-star {
      color: var(--vscode-editorWarning-foreground, #cca700);
      font-size: 0.85em;
      line-height: 1;
    }
    .node-icon-notes {
      font-size: 0.68em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
      border-radius: 999px;
      padding: 2px 6px;
    }
    .msg { margin: 8px 0; padding: 8px; border-radius: 4px; border-left: 3px solid var(--vscode-focusBorder); }
    .msg.user { background: var(--vscode-editor-inactiveSelectionBackground); }
    .msg.assistant { background: var(--vscode-textBlockQuote-background); }
    .msg.assistant.streaming { box-shadow: inset 0 0 0 1px var(--vscode-focusBorder, var(--vscode-panel-border)); }
    .agent-trace {
      margin-top: 10px;
      border: 1px solid var(--vscode-focusBorder, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 6px 8px;
      background: var(--vscode-editor-background);
    }
    .agent-trace > summary.trace-summary {
      cursor: pointer;
      font-size: 0.9em;
      font-weight: 600;
      color: var(--vscode-foreground);
      user-select: none;
      list-style: none;
    }
    .agent-trace > summary.trace-summary::-webkit-details-marker { display: none; }
    .agent-trace-missing {
      margin-top: 8px;
      padding: 8px 10px;
      border-radius: 4px;
      border: 1px dashed var(--vscode-panel-border);
      font-size: 0.9em;
      line-height: 1.45;
    }
    .trace-entry { margin: 8px 0 0; padding-top: 6px; border-top: 1px solid var(--vscode-panel-border); }
    .trace-entry:first-of-type { border-top: none; padding-top: 0; margin-top: 4px; }
    .trace-meta { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .trace-pre {
      margin: 0;
      max-height: 240px;
      overflow: auto;
      font-size: 0.78em;
      line-height: 1.35;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 8px;
    }
    .trace-diff-colored .trace-diff-lines {
      display: block;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .trace-diff-colored .diff-line {
      display: block;
      padding: 0 2px;
      border-radius: 2px;
    }
    .trace-meta .diff-stats { font-weight: 600; white-space: nowrap; }
    .trace-meta .diff-stat-add {
      color: var(--vscode-gitDecoration-addedResourceForeground, var(--vscode-terminal-ansiGreen, #73c991));
    }
    .trace-meta .diff-stat-del {
      margin-left: 6px;
      color: var(--vscode-gitDecoration-deletedResourceForeground, var(--vscode-terminal-ansiRed, #f88070));
    }
    .diff-line.diff-meta {
      color: var(--vscode-descriptionForeground);
      opacity: 0.95;
    }
    .diff-line.diff-hunk {
      color: var(--vscode-editorInfo-foreground, var(--vscode-symbolIcon-interfaceForeground, #6796e6));
      font-weight: 500;
    }
    .diff-line.diff-ctx { color: var(--vscode-editor-foreground); }
    .diff-line.diff-noeol {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      font-size: 0.95em;
    }
    .diff-line.diff-add {
      background: var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground, rgba(80, 200, 120, 0.14)));
      color: var(--vscode-diffEditor-insertedTextColor, var(--vscode-editor-foreground));
    }
    .diff-line.diff-del {
      background: var(--vscode-diffEditor-removedLineBackground, var(--vscode-diffEditor-removedTextBackground, rgba(240, 80, 80, 0.14)));
      color: var(--vscode-diffEditor-removedTextColor, var(--vscode-editor-foreground));
    }
    .msg .role { font-size: 0.8em; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
    .msg-notes {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed var(--vscode-widget-border, var(--vscode-panel-border));
    }
    .note-block {
      margin-bottom: 10px;
      padding: 8px 10px;
      border-radius: 6px;
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(127, 127, 127, 0.08));
      border: 1px solid var(--vscode-panel-border);
    }
    .note-block:last-child { margin-bottom: 0; }
    .note-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }
    .note-toolbar button { font-size: 0.85em; padding: 2px 8px; }
    .thread .msg .note-body.md {
      white-space: normal;
      word-break: break-word;
      line-height: 1.5;
      font-size: calc(var(--vscode-editor-font-size, var(--vscode-font-size)) * 0.95);
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
    }
    /* Thread bodies: GFM markdown from host (sanitized HTML). */
    .thread .msg .body.md,
    .thread .msg .note-body.md {
      unicode-bidi: plaintext;
    }
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
    .thread .msg .body.md .code-block-wrap {
      position: relative;
      margin: 0.55em 0;
    }
    .thread .msg .body.md .code-block-wrap::after {
      content: "";
      display: table;
      clear: both;
    }
    .thread .msg .body.md .code-block-wrap .code-copy {
      float: right;
      margin: 0 0 6px 8px;
      padding: 2px 10px;
      font-size: 0.85em;
    }
    .thread .msg .body.md pre {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
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
    .composer label.priv {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      margin-top: 8px;
    }
    .composer label.priv input { cursor: pointer; margin-top: 2px; flex-shrink: 0; }
    .composer label.priv .priv-body {
      display: flex;
      flex-direction: column;
      gap: 3px;
      line-height: 1.35;
      max-width: 52em;
    }
    .composer label.priv .priv-lead {
      font-weight: 600;
      color: var(--vscode-foreground);
      font-size: 0.95em;
    }
    .composer label.priv .priv-desc {
      font-size: 0.88em;
      color: var(--vscode-descriptionForeground);
    }
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
      <div class="hint tree-panel-hint">Event tree — click a node to choose where the next reply attaches. Drag the right edge of this panel to resize.</div>
      <div class="tree-scroll">
        <div id="tree" class="tree"></div>
      </div>
    </div>
    <div class="col-main">
      <div class="detail-bar">
        <div id="breadcrumb" class="crumb hint"></div>
        <div class="detail-actions">
          <button type="button" id="btnShowMembers" class="btn-secondary" title="Show conversation members">Members</button>
          <button type="button" id="btnAddMember" class="btn-secondary" title="Invite an editor/viewer to this conversation">Add member…</button>
          <button type="button" id="btnChangeMemberRole" class="btn-secondary" title="Change a member role">Change role…</button>
          <button type="button" id="btnRemoveMember" class="btn-secondary" title="Remove a member from this conversation">Remove member…</button>
          <button type="button" id="btnStarredDrawer" class="btn-secondary" title="List starred messages in this conversation">Starred</button>
          <button type="button" id="btnTodoDrawer" class="btn-secondary" title="List TODO notes in this conversation">TODO notes</button>
          <button type="button" id="btnDrawers" class="btn-secondary" title="Open the Starred/TODO drawers panel">Drawers</button>
          <button type="button" id="btnOpenSideChat" class="btn-secondary" title="Open side chat for this conversation">Open side chat</button>
          <button type="button" id="btnSetupCursorCli" class="btn-secondary" title="Set up the Cursor CLI for the Colcoor agent">CLI setup</button>
          <button type="button" id="btnSetCursorAgentApiKey" class="btn-secondary" title="Store the Cursor API key used for the Colcoor agent">Agent API key</button>
          <button type="button" id="btnDeleteConversation" class="btn-secondary" title="Delete this conversation">Delete conversation…</button>
          <button type="button" id="btnProfile" class="btn-secondary" title="Edit your Colcoor profile">Profile…</button>
          <button type="button" id="btnSettings" class="btn-secondary" title="Open Colcoor extension settings">Settings</button>
          <button type="button" id="btnAbout" class="btn-secondary" title="About Colcoor">About</button>
          <button type="button" id="btnRename" class="btn-secondary">Rename…</button>
          <button type="button" id="btnPin" class="btn-secondary">Pin</button>
          <button type="button" id="btnContinueFromHere" class="btn-secondary" title="Set the selected message as the active continue point">Continue from here</button>
          <button type="button" id="btnReferenceSideChat" class="btn-secondary" title="Open side chat and prefill a reference to the selected message">Reference in side chat</button>
          <button type="button" id="btnReferenceNoteSideChat" class="btn-secondary" title="Open side chat and choose a note from the selected message to reference">Reference note in side chat</button>
          <button type="button" id="btnCopy" class="btn-secondary">Copy message</button>
          <button type="button" id="btnCopyThread" class="btn-secondary" title="Copy root → selected path as plain text">Copy thread</button>
          <button type="button" id="btnResend" class="btn-secondary">Resend assistant</button>
          <button type="button" id="btnJumpTip" class="btn-secondary" title="Select the newest leaf on the default branch">Jump to latest</button>
        </div>
      </div>
      <div class="thread">
        <div class="hint thread-hint">Thread (root → selected)</div>
        <div class="thread-scroll">
          <div id="thread"></div>
        </div>
      </div>
      <div class="composer">
        <textarea id="input" dir="auto" placeholder="Message… Shift+Enter for newline, Enter to send"></textarea>
        <label class="priv hint" title="${PRIVATE_BRANCH_LABEL_TITLE}">
          <input type="checkbox" id="privateBranch" title="${PRIVATE_BRANCH_LABEL_TITLE}" aria-describedby="privateBranchHelp" />
          <span class="priv-body">
            <span class="priv-lead">${PRIVATE_BRANCH_LEAD}</span>
            <span id="privateBranchHelp" class="priv-desc">${PRIVATE_BRANCH_DESCRIPTION}</span>
          </span>
        </label>
        <div class="row">
          <button id="send" type="button" disabled>Send</button>
          <button id="stop" type="button" class="btn-secondary" disabled>Stop</button>
          <button id="refresh" type="button">Refresh tree</button>
          <span class="hint" id="busy" style="display:none">Working…</span>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let hasReceivedState = false;
    let state = {
      conversationId: "",
      title: null,
      conversationPinned: false,
      events: [],
      selectedEventId: "",
      threadSegments: [],
      threadPlainText: "",
      treeWidthPx: null,
      /** Host workspace persistence; bounds match composerLayoutPersistence.ts (72–800). */
      composerTextareaHeightPx: null,
      agentTraceOpen: true,
      needsContextRebuild: false,
      busy: false,
      lastError: null,
      // Sanitized HTML for in-flight assistant text; cleared when the host sends a full state snapshot.
      streamingHtml: null,
      /** Event ids whose child branches are collapsed in the indented tree (client-only; [tree-ui-contract.md]). */
      treeCollapsedIds: {},
    };

    function applyTreeWidth() {
      var el = document.querySelector(".col-tree");
      if (!el) return;
      var w = null;
      if (typeof state.treeWidthPx === "number" && state.treeWidthPx >= 140) w = state.treeWidthPx;
      if (w == null) {
        try {
          w = parseInt(localStorage.getItem("colcoor.treeWidthPx"), 10);
        } catch (e) {}
      }
      if (w != null && w >= 140) el.style.width = w + "px";
    }

    (function applySavedTreeWidthColdStart() {
      try {
        var w = parseInt(localStorage.getItem("colcoor.treeWidthPx"), 10);
        var el = document.querySelector(".col-tree");
        if (el && w >= 140) el.style.width = w + "px";
      } catch (e) {}
    })();

    (function applySavedComposerHeightColdStart() {
      try {
        var h = parseInt(localStorage.getItem("colcoor.composerTextareaHeightPx"), 10);
        var ta = document.getElementById("input");
        if (ta && h >= 72 && h <= 800) ta.style.height = h + "px";
      } catch (e) {}
    })();

    function esc(s) {
      return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    /** Tree time label: &lt; 1h → minutes ago; else hh:mm DD/MM/YYYY ([tree-ui-contract.md] §7). */
    function eventTimeLabel(iso) {
      if (!iso) return "";
      var t = Date.parse(String(iso));
      if (!Number.isFinite(t)) return "";
      var sec = Math.floor((Date.now() - t) / 1000);
      if (sec < 60) return "just now";
      if (sec < 3600) {
        var mins = Math.floor(sec / 60);
        return mins === 1 ? "1 minute ago" : mins + " minutes ago";
      }
      var d = new Date(t);
      var hh = String(d.getHours()).padStart(2, "0");
      var mm = String(d.getMinutes()).padStart(2, "0");
      var DD = String(d.getDate()).padStart(2, "0");
      var MM = String(d.getMonth() + 1).padStart(2, "0");
      var YYYY = d.getFullYear();
      return hh + ":" + mm + " " + DD + "/" + MM + "/" + YYYY;
    }

    function eventDisplayTitle(ev) {
      var j = ev.content_json;
      if (!j || typeof j !== "object") return "";
      var raw = j.title ?? j.message_title ?? j.display_title;
      if (typeof raw !== "string") return "";
      var s = raw.trim();
      if (!s) return "";
      return s.length > 160 ? s.slice(0, 160) + "…" : s;
    }

    function snippet(ev) {
      const t = (ev.content_text || "").trim().replace(/\\s+/g, " ");
      if (!t) return "(empty)";
      return t.length > 96 ? t.slice(0, 96) + "…" : t;
    }

    function treeKindLabel(kind) {
      if (kind === "user_input") return "User";
      if (kind === "assistant_output") return "Assistant";
      const s = String(kind || "").trim();
      if (!s) return "Event";
      return s.replace(/_/g, " ");
    }

    function treeRoleClass(kind) {
      if (kind === "user_input") return "role-user";
      if (kind === "assistant_output") return "role-assistant";
      return "role-other";
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

    function traceSummaryLineLegacy(ev) {
      if (!ev || typeof ev !== "object") return "Event";
      const t = ev.type;
      if (t === "tool_call") {
        const st = ev.subtype != null ? String(ev.subtype) : "";
        const tc = ev.tool_call;
        if (tc && typeof tc === "object") {
          if (tc.readToolCall && tc.readToolCall.args && tc.readToolCall.args.path)
            return "Read " + String(tc.readToolCall.args.path);
          if (tc.writeToolCall && tc.writeToolCall.args && tc.writeToolCall.args.path)
            return "Write " + String(tc.writeToolCall.args.path);
        }
        return "Tool " + (st || "?");
      }
      if (t === "system") return "Session · " + (ev.model ? String(ev.model) : "init");
      if (t === "assistant") return "Assistant (stream)";
      if (t === "user") return "User (echo)";
      if (t === "result") return "Result";
      if (t === "colcoor_truncated") return "Truncated";
      return t ? String(t) : "Event";
    }

    function formatTraceEntryHtml(ev, idx) {
      const n = String(idx + 1);
      if (ev && ev.colcoor_row === "read" && typeof ev.text === "string") {
        return (
          '<div class="trace-entry trace-row-read"><div class="trace-meta" dir="auto">' +
            n +
            ". " +
            esc(ev.text) +
            "</div></div>"
        );
      }
      if (ev && ev.colcoor_row === "edit_diff" && typeof ev.diff === "string") {
        var editPath =
          ev.path != null && String(ev.path).trim() !== "" ? " · " + esc(String(ev.path).trim()) : "";
        var da = typeof ev.diff_added === "number" ? ev.diff_added : 0;
        var dr = typeof ev.diff_removed === "number" ? ev.diff_removed : 0;
        var statsPart = "";
        if (da > 0 || dr > 0) {
          statsPart = ' <span class="diff-stats">';
          if (da > 0) statsPart += '<span class="diff-stat-add">+' + String(da) + "</span>";
          if (dr > 0)
            statsPart += (da > 0 ? " " : "") + '<span class="diff-stat-del">-' + String(dr) + "</span>";
          statsPart += "</span>";
        }
        var body =
          typeof ev.diff_html === "string" && ev.diff_html.length
            ? ev.diff_html
            : '<pre class="trace-pre trace-diff" dir="auto">' + esc(ev.diff) + "</pre>";
        return (
          '<div class="trace-entry trace-row-edit"><div class="trace-meta">' +
          n +
          ". Edit (diff)" +
          editPath +
          statsPart +
          "</div>" +
          body +
          "</div>"
        );
      }
      if (ev && ev.colcoor_row === "shell_start" && typeof ev.text === "string") {
        return (
          '<div class="trace-entry trace-row-shell"><div class="trace-meta">' +
          n +
          '. Shell</div><pre class="trace-pre" dir="auto">' +
          esc(ev.text) +
          "</pre></div>"
        );
      }
      if (ev && ev.colcoor_row === "shell_done" && typeof ev.text === "string") {
        return (
          '<div class="trace-entry trace-row-shell"><div class="trace-meta">' +
          n +
          '. Shell result</div><pre class="trace-pre" dir="auto">' +
          esc(ev.text) +
          "</pre></div>"
        );
      }
      const sum = esc(traceSummaryLineLegacy(ev));
      let raw;
      try {
        raw = esc(JSON.stringify(ev, null, 2));
      } catch {
        raw = esc(String(ev));
      }
      return (
        '<div class="trace-entry trace-legacy"><div class="trace-meta">' +
        n +
        ". " +
        sum +
        '</div><pre class="trace-pre" dir="auto">' +
        raw +
        "</pre></div>"
      );
    }

    function renderDetailBar() {
      const crumb = document.getElementById("breadcrumb");
      const copyBtn = document.getElementById("btnCopy");
      const copyThreadBtn = document.getElementById("btnCopyThread");
      const continueBtn = document.getElementById("btnContinueFromHere");
      const refSideChatBtn = document.getElementById("btnReferenceSideChat");
      const refNoteSideChatBtn = document.getElementById("btnReferenceNoteSideChat");
      const showMembersBtn = document.getElementById("btnShowMembers");
      const addMemberBtn = document.getElementById("btnAddMember");
      const changeMemberRoleBtn = document.getElementById("btnChangeMemberRole");
      const removeMemberBtn = document.getElementById("btnRemoveMember");
      const starredDrawerBtn = document.getElementById("btnStarredDrawer");
      const todoDrawerBtn = document.getElementById("btnTodoDrawer");
      const drawersBtn = document.getElementById("btnDrawers");
      const openSideChatBtn = document.getElementById("btnOpenSideChat");
      const setupCursorCliBtn = document.getElementById("btnSetupCursorCli");
      const setCursorAgentApiKeyBtn = document.getElementById("btnSetCursorAgentApiKey");
      const deleteConversationBtn = document.getElementById("btnDeleteConversation");
      const profileBtn = document.getElementById("btnProfile");
      const settingsBtn = document.getElementById("btnSettings");
      const aboutBtn = document.getElementById("btnAbout");
      const resendBtn = document.getElementById("btnResend");
      if (!crumb || !copyBtn || !resendBtn || !continueBtn || !refSideChatBtn || !refNoteSideChatBtn)
        return;
      if (showMembersBtn) showMembersBtn.disabled = state.busy;
      if (addMemberBtn) addMemberBtn.disabled = state.busy;
      if (changeMemberRoleBtn) changeMemberRoleBtn.disabled = state.busy;
      if (removeMemberBtn) removeMemberBtn.disabled = state.busy;
      if (starredDrawerBtn) starredDrawerBtn.disabled = state.busy;
      if (todoDrawerBtn) todoDrawerBtn.disabled = state.busy;
      if (drawersBtn) drawersBtn.disabled = state.busy;
      if (openSideChatBtn) openSideChatBtn.disabled = state.busy;
      if (setupCursorCliBtn) setupCursorCliBtn.disabled = state.busy;
      if (setCursorAgentApiKeyBtn) setCursorAgentApiKeyBtn.disabled = state.busy;
      if (deleteConversationBtn) deleteConversationBtn.disabled = state.busy;
      if (profileBtn) profileBtn.disabled = state.busy;
      if (settingsBtn) settingsBtn.disabled = state.busy;
      if (aboutBtn) aboutBtn.disabled = state.busy;
      const sel = state.selectedEventId;
      const evs = state.events || [];
      const path = pathChain(evs, sel);
      if (!path.length) {
        crumb.innerHTML = '<span class="empty">No selection</span>';
        copyBtn.disabled = true;
        continueBtn.disabled = true;
        refSideChatBtn.disabled = true;
        refNoteSideChatBtn.disabled = true;
        resendBtn.disabled = true;
        if (copyThreadBtn) copyThreadBtn.disabled = true;
        const renameBtn = document.getElementById("btnRename");
        const pinBtn = document.getElementById("btnPin");
        if (renameBtn) renameBtn.disabled = state.busy;
        if (pinBtn) {
          pinBtn.disabled = state.busy;
          pinBtn.textContent = state.conversationPinned ? "Unpin" : "Pin";
        }
        const jumpBtnEmpty = document.getElementById("btnJumpTip");
        if (jumpBtnEmpty) jumpBtnEmpty.disabled = state.busy;
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
      continueBtn.disabled = state.busy;
      continueBtn.title = state.busy
        ? "Wait for the current operation to finish."
        : "Set this selected message as the active continue point.";
      refSideChatBtn.disabled = state.busy;
      refSideChatBtn.title = state.busy
        ? "Wait for the current operation to finish."
        : "Open side chat with a reference to the selected message.";
      refNoteSideChatBtn.disabled = state.busy;
      refNoteSideChatBtn.title = state.busy
        ? "Wait for the current operation to finish."
        : "Open side chat and pick a note from the selected message.";
      const canCopyThread = String(state.threadPlainText || "").trim().length > 0;
      if (copyThreadBtn) {
        copyThreadBtn.disabled = state.busy || !canCopyThread;
        copyThreadBtn.title = canCopyThread
          ? "Copy the visible thread (root → selected) as plain text"
          : "Nothing to copy on this path yet.";
      }
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
      const jumpBtn = document.getElementById("btnJumpTip");
      if (jumpBtn) jumpBtn.disabled = state.busy;
    }

    var treeResizeObserver = null;
    function wireTreeResize() {
      var el = document.querySelector(".col-tree");
      if (!el || typeof ResizeObserver === "undefined") return;
      if (treeResizeObserver) treeResizeObserver.disconnect();
      var tid = null;
      treeResizeObserver = new ResizeObserver(function () {
        if (tid) clearTimeout(tid);
        tid = setTimeout(function () {
          try {
            var w = el.offsetWidth;
            if (w >= 140) {
              localStorage.setItem("colcoor.treeWidthPx", String(w));
              vscode.postMessage({ type: "layout", treeWidthPx: w });
            }
          } catch (e) {}
        }, 250);
      });
      treeResizeObserver.observe(el);
    }

    var composerResizeObserver = null;
    function wireComposerResize() {
      var ta = document.getElementById("input");
      if (!ta || typeof ResizeObserver === "undefined") return;
      if (composerResizeObserver) composerResizeObserver.disconnect();
      var tid = null;
      composerResizeObserver = new ResizeObserver(function () {
        if (tid) clearTimeout(tid);
        tid = setTimeout(function () {
          try {
            var h = ta.offsetHeight;
            if (h >= 72 && h <= 800) {
              localStorage.setItem("colcoor.composerTextareaHeightPx", String(h));
              vscode.postMessage({ type: "layout", composerTextareaHeightPx: h });
            }
          } catch (e) {}
        }, 250);
      });
      composerResizeObserver.observe(ta);
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
          const roleC = treeRoleClass(e.kind);
          const isPriv = e.visible_to != null && String(e.visible_to).trim() !== "";
          const badge = isPriv ? '<span class="badge-pvt">Private</span>' : "";
          const when = eventTimeLabel(e.created_at);
          const whenSpan = when ? '<span class="when">' + esc(when) + "</span>" : "";
          const snip = snippet(e);
          const snipCls = snip === "(empty)" ? " node-snippet-empty" : "";
          const title = eventDisplayTitle(e);
          const titleBlock = title ? '<div class="node-title">' + esc(title) + "</div>" : "";
          const childList = byParent.get(e.id);
          const hasKids = !!(childList && childList.length);
          const collapsed = !!(hasKids && state.treeCollapsedIds && state.treeCollapsedIds[e.id]);
          const expander = hasKids
            ? '<button type="button" class="tree-expand tree-expand-hit" data-expand-for="' +
              esc(e.id) +
              '" aria-expanded="' +
              (collapsed ? "false" : "true") +
              '" title="Show or hide replies">' +
              (collapsed ? "▶" : "▼") +
              "</button>"
            : '<span class="tree-expand-spacer" aria-hidden="true"></span>';
          var nc = typeof e.note_count === "number" ? e.note_count : 0;
          var icons = "";
          if (e.starred === true) {
            icons += '<span class="node-icon-star" title="Starred">★</span>';
          }
          if (nc > 0) {
            icons += '<span class="node-icon-notes" title="Notes on this message">' + String(nc) + "</span>";
          }
          var iconsWrap = icons ? '<span class="node-icons">' + icons + "</span>" : "";
          html +=
            '<li class="tree-branch"><div class="tree-row">' +
            expander +
            '<div class="node ' +
            roleC +
            sel +
            '" data-id="' +
            esc(e.id) +
            '">' +
            '<div class="node-inner">' +
            '<div class="node-head">' +
            badge +
            '<span class="node-role">' +
            esc(treeKindLabel(e.kind)) +
            "</span>" +
            whenSpan +
            iconsWrap +
            "</div>" +
            titleBlock +
            '<div class="node-snippet' +
            snipCls +
            '" dir="auto">' +
            esc(snip) +
            "</div></div></div></div>";
          if (hasKids && !collapsed) {
            html += walk(e.id);
          }
          html += "</li>";
        }
        html += "</ul>";
        return html;
      }
      root.innerHTML = walk("__root__");
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
          '</div><div class="body md" dir="auto">' +
          s.html +
          "</div>";
        if (s.notes && s.notes.length) {
          html += '<div class="msg-notes">';
          for (var ni = 0; ni < s.notes.length; ni++) {
            var nb = s.notes[ni];
            var nid = nb && nb.id ? String(nb.id) : "";
            var nhtml = nb && nb.html ? String(nb.html) : "";
            html +=
              '<div class="note-block" data-note-id="' +
              esc(nid) +
              '"><div class="note-toolbar">' +
              '<button type="button" class="btn-secondary note-edit" data-note-id="' +
              esc(nid) +
              '">Edit…</button>' +
              '<button type="button" class="btn-secondary note-delete" data-note-id="' +
              esc(nid) +
              '">Delete</button></div><div class="note-body md" dir="auto">' +
              nhtml +
              "</div></div>";
          }
          html += "</div>";
        }
        if (s.role === "assistant") {
          if (s.traceEntries && s.traceEntries.length) {
            var traceOpen = state.agentTraceOpen !== false;
            html +=
              "<details" +
              (traceOpen ? " open" : "") +
              ' class="agent-trace"><summary class="trace-summary">CLI trace — ' +
              s.traceEntries.length +
              " step(s) · reads, edits, shell (collapse)</summary>";
            for (let i = 0; i < s.traceEntries.length; i++) {
              html += formatTraceEntryHtml(s.traceEntries[i], i);
            }
            html += "</details>";
          } else {
            html +=
              '<p class="agent-trace-missing hint">' +
              esc(
                "No CLI trace for this reply. Use stream-json or stream-json-partial (not text/stub) and send again. Saved steps are short summaries: read ranges, edit diffs, shell commands — not the full transcript.",
              ) +
              "</p>";
          }
        }
        html += "</div>";
      }
      if (state.streamingHtml) {
        html +=
          '<div class="msg assistant streaming"><div class="role">Assistant</div><div class="body md" dir="auto">' +
          state.streamingHtml +
          "</div></div>";
      }
      el.innerHTML = html || '<p class="empty">Nothing to show on this path.</p>';
    }

    function updateComposerSendEnabled() {
      var sendBtn = document.getElementById("send");
      var ta = document.getElementById("input");
      if (!sendBtn) {
        return;
      }
      if (state.busy) {
        sendBtn.disabled = true;
        return;
      }
      var has = ta && String(ta.value || "").trim().length > 0;
      sendBtn.disabled = !has;
      sendBtn.title = has
        ? ""
        : "Type a non-empty message. Shift+Enter for newline, Enter to send.";
    }

    function shouldSendComposerOnEnter(ev) {
      if (!ev || ev.key !== "Enter") return false;
      if (ev.isComposing) return false;
      if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return false;
      return true;
    }

    function render() {
      try {
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
          var subBase =
            state.events.length +
            " event(s) — reply attaches under the selected tree node.";
          if (state.needsContextRebuild) {
            subBase += " Next send rebuilds assistant context from the full branch path (root → selected).";
          }
          subEl.textContent = subBase;
        }
        if (sendBtn) {
          sendBtn.textContent = state.busy ? "Sending…" : "Send";
          if (state.busy) {
            sendBtn.disabled = true;
            sendBtn.title = "A reply is in progress. Use Stop to cancel.";
          } else {
            updateComposerSendEnabled();
          }
        }
        if (stopBtn) {
          stopBtn.disabled = !state.busy;
          stopBtn.title = state.busy ? "Cancel the in-progress assistant reply." : "";
        }
        if (refBtn) refBtn.disabled = state.busy;
        if (ta) ta.disabled = state.busy;
        if (priv) priv.disabled = state.busy;
        if (busyEl) {
          busyEl.style.display = state.busy ? "inline" : "none";
          busyEl.textContent = state.busy ? "Sending… Press Stop to cancel." : "Working…";
        }
        if (ta) {
          var compH = null;
          if (typeof state.composerTextareaHeightPx === "number") {
            var sh = state.composerTextareaHeightPx;
            if (sh >= 72 && sh <= 800) compH = sh;
          }
          if (compH == null) {
            try {
              var lh = parseInt(localStorage.getItem("colcoor.composerTextareaHeightPx"), 10);
              if (lh >= 72 && lh <= 800) compH = lh;
            } catch (e2) {}
          }
          if (compH != null) ta.style.height = compH + "px";
        }
        renderTree();
        renderThread();
        renderDetailBar();
        applyTreeWidth();
        wireTreeResize();
        wireComposerResize();
      } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e);
        const subEl = document.getElementById("sub");
        if (subEl) subEl.textContent = "Colcoor webview render error: " + msg;
        const errEl = document.getElementById("err");
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = msg;
        }
      }
    }

    (function wireTreeRootDelegation() {
      var root = document.getElementById("tree");
      if (!root) return;
      root.addEventListener("click", function (ev) {
        var btn = ev.target.closest && ev.target.closest("button.tree-expand-hit");
        if (btn) {
          ev.preventDefault();
          ev.stopPropagation();
          var eid = btn.getAttribute("data-expand-for");
          if (!eid) return;
          var cur = state.treeCollapsedIds || {};
          var next = {};
          for (var k in cur) {
            if (Object.prototype.hasOwnProperty.call(cur, k) && cur[k]) {
              next[k] = true;
            }
          }
          if (next[eid]) {
            delete next[eid];
          } else {
            next[eid] = true;
          }
          state.treeCollapsedIds = next;
          renderTree();
          var collapsedList = [];
          for (var cid in state.treeCollapsedIds) {
            if (Object.prototype.hasOwnProperty.call(state.treeCollapsedIds, cid) && state.treeCollapsedIds[cid]) {
              collapsedList.push(cid);
            }
          }
          vscode.postMessage({ type: "treeCollapse", collapsedEventIds: collapsedList });
          return;
        }
        var node = ev.target.closest && ev.target.closest(".node");
        if (node) {
          var nid = node.getAttribute("data-id");
          if (nid) vscode.postMessage({ type: "select", id: nid });
        }
      });
    })();

    window.addEventListener("message", (event) => {
      const m = event.data;
      if (m && m.type === "state") {
        hasReceivedState = true;
        var collapsedFromHost = {};
        (m.treeCollapsedEventIds || []).forEach(function (id) {
          collapsedFromHost[id] = true;
        });
        state = { ...m, streamingHtml: null, treeCollapsedIds: collapsedFromHost };
        render();
        return;
      }
      if (m && m.type === "assistantStream" && typeof m.html === "string") {
        state = { ...state, streamingHtml: m.html || null };
        try {
          renderThread();
        } catch (e) {
          const msg = e && e.message ? String(e.message) : String(e);
          const errEl = document.getElementById("err");
          if (errEl) {
            errEl.style.display = "block";
            errEl.textContent = msg;
          }
        }
      }
    });

    setTimeout(function () {
      if (hasReceivedState) return;
      var subEl = document.getElementById("sub");
      if (!subEl) return;
      subEl.textContent =
        "Still waiting for a conversation snapshot from the extension. API calls time out after 30s — check Settings → Colcoor → backend base URL, that the API is running, and sign-in — then click Refresh tree.";
    }, 32000);

    document.getElementById("send").addEventListener("click", () => {
      const ta = document.getElementById("input");
      const text = ta && ta.value ? ta.value.trim() : "";
      if (!text) return;
      const priv = document.getElementById("privateBranch");
      const privateBranch = priv && priv.checked;
      vscode.postMessage({ type: "send", text: ta.value.trimEnd(), privateBranch });
      ta.value = "";
      updateComposerSendEnabled();
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

    document.getElementById("btnCopyThread").addEventListener("click", () => {
      const t = String(state.threadPlainText || "").trim();
      if (!t) return;
      vscode.postMessage({ type: "copyThread", text: state.threadPlainText || "" });
    });

    document.getElementById("btnResend").addEventListener("click", () => {
      vscode.postMessage({ type: "resend" });
    });

    document.getElementById("btnContinueFromHere").addEventListener("click", () => {
      vscode.postMessage({ type: "continueFromHere" });
    });

    document.getElementById("btnReferenceSideChat").addEventListener("click", () => {
      vscode.postMessage({ type: "referenceInSideChat" });
    });

    document.getElementById("btnReferenceNoteSideChat").addEventListener("click", () => {
      vscode.postMessage({ type: "referenceNoteInSideChat" });
    });

    document.getElementById("btnRename").addEventListener("click", () => {
      vscode.postMessage({ type: "rename" });
    });

    document.getElementById("btnPin").addEventListener("click", () => {
      vscode.postMessage({ type: "togglePin" });
    });
    document.getElementById("btnStarredDrawer").addEventListener("click", () => {
      vscode.postMessage({ type: "openStarredDrawer" });
    });
    document.getElementById("btnTodoDrawer").addEventListener("click", () => {
      vscode.postMessage({ type: "openTodoDrawer" });
    });
    document.getElementById("btnDrawers").addEventListener("click", () => {
      vscode.postMessage({ type: "openDrawers" });
    });
    document.getElementById("btnOpenSideChat").addEventListener("click", () => {
      vscode.postMessage({ type: "openSideChat" });
    });
    document.getElementById("btnSetupCursorCli").addEventListener("click", () => {
      vscode.postMessage({ type: "setupCursorCli" });
    });
    document.getElementById("btnSetCursorAgentApiKey").addEventListener("click", () => {
      vscode.postMessage({ type: "setCursorAgentApiKey" });
    });
    document.getElementById("btnDeleteConversation").addEventListener("click", () => {
      vscode.postMessage({ type: "deleteConversation" });
    });
    document.getElementById("btnProfile").addEventListener("click", () => {
      vscode.postMessage({ type: "openProfile" });
    });
    document.getElementById("btnSettings").addEventListener("click", () => {
      vscode.postMessage({ type: "openSettings" });
    });
    document.getElementById("btnAbout").addEventListener("click", () => {
      vscode.postMessage({ type: "openAbout" });
    });
    document.getElementById("btnShowMembers").addEventListener("click", () => {
      vscode.postMessage({ type: "openMembers" });
    });
    document.getElementById("btnAddMember").addEventListener("click", () => {
      vscode.postMessage({ type: "addMember" });
    });
    document.getElementById("btnChangeMemberRole").addEventListener("click", () => {
      vscode.postMessage({ type: "changeMemberRole" });
    });
    document.getElementById("btnRemoveMember").addEventListener("click", () => {
      vscode.postMessage({ type: "removeMember" });
    });

    var btnJump = document.getElementById("btnJumpTip");
    if (btnJump) {
      btnJump.addEventListener("click", function () {
        vscode.postMessage({ type: "selectTip" });
      });
    }

    document.getElementById("thread").addEventListener("click", function (ev) {
      var del = ev.target && ev.target.closest && ev.target.closest(".note-delete");
      if (del) {
        ev.preventDefault();
        var did = del.getAttribute("data-note-id");
        if (did) vscode.postMessage({ type: "deleteNote", noteId: did });
        return;
      }
      var ed = ev.target && ev.target.closest && ev.target.closest(".note-edit");
      if (ed) {
        ev.preventDefault();
        var eid = ed.getAttribute("data-note-id");
        if (eid) vscode.postMessage({ type: "editNote", noteId: eid });
        return;
      }
      var t = ev.target;
      var copyBtn = t && t.closest && t.closest(".code-copy");
      if (!copyBtn) return;
      ev.preventDefault();
      var wrap = copyBtn.closest && copyBtn.closest(".code-block-wrap");
      var pre = wrap && wrap.querySelector("pre");
      var text = pre ? pre.innerText || "" : "";
      vscode.postMessage({ type: "copy", text: text });
    });

    document.getElementById("input").addEventListener("input", function () {
      updateComposerSendEnabled();
    });

    document.getElementById("input").addEventListener("keydown", (e) => {
      if (!shouldSendComposerOnEnter(e)) return;
      var sb = document.getElementById("send");
      if (sb && sb.disabled) {
        return;
      }
      e.preventDefault();
      if (sb) sb.click();
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}
