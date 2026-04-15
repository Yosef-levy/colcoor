/** HTML document for the Colcoor conversation webview (tree + thread + composer). */

import {
  PRIVATE_BRANCH_DESCRIPTION,
  PRIVATE_BRANCH_LABEL_TITLE,
  PRIVATE_BRANCH_LEAD,
} from "./privateBranchComposerCopy";
import { treeEventTimeLabelWebviewScriptBlock } from "./treeEventTimeLabel";
import { TREE_EVENT_DISPLAY_TITLE_MAX, TREE_EVENT_SNIPPET_MAX } from "./treeNodeDisplay";
import {
  COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
  COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL,
} from "../util/colcoorApiFailureActions";

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
      width: 28%;
      min-width: 140px;
      max-width: 70%;
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
    .col-center {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      gap: 10px;
      overflow: hidden;
    }
    .col-sidechat {
      flex: 0 0 auto;
      width: 30%;
      min-width: 160px;
      max-width: 55%;
      resize: horizontal;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      display: none;
      flex-direction: column;
      min-height: 0;
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
    .menubar {
      flex-shrink: 0;
      flex-grow: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 0;
      padding: 0 4px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      background: var(--vscode-menu-barBackground, var(--vscode-sideBar-background));
      position: relative;
      z-index: 5;
      user-select: none;
    }
    .menu-root {
      position: relative;
    }
    .menu-root-btn {
      margin: 0;
      padding: 6px 10px;
      border: none;
      border-radius: 0;
      font: inherit;
      font-size: 13px;
      line-height: 1.35;
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      background: transparent;
      cursor: pointer;
    }
    .menu-root-btn:hover {
      background: var(--vscode-menubar-selectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-menubar-selectionForeground, var(--vscode-list-activeSelectionForeground));
    }
    .menu-root-btn.menu-open {
      background: var(--vscode-menubar-selectionBackground, var(--vscode-list-activeSelectionBackground));
      color: var(--vscode-menubar-selectionForeground, var(--vscode-list-activeSelectionForeground));
    }
    .menu-panel {
      position: absolute;
      top: 100%;
      left: 0;
      min-width: 220px;
      max-width: min(340px, 92vw);
      margin-top: 2px;
      padding: 4px 0;
      border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
      border-radius: 4px;
      background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      z-index: 20;
    }
    .menu-item {
      display: block;
      width: 100%;
      margin: 0;
      padding: 5px 14px;
      border: none;
      border-radius: 0;
      font: inherit;
      font-size: 13px;
      line-height: 1.4;
      text-align: left;
      white-space: nowrap;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }
    .menu-item:hover:not(:disabled) {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
    }
    .menu-item:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .menu-sep {
      height: 1px;
      margin: 4px 8px;
      border: none;
      background: var(--vscode-menu-separatorBackground, var(--vscode-widget-border, var(--vscode-panel-border)));
    }
    .crumb-step strong { font-weight: 600; color: var(--vscode-foreground); }
    .crumb-checkpoint { font-weight: 500; color: var(--vscode-descriptionForeground); font-size: 0.95em; }
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
      position: relative;
      z-index: 1;
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
    .inline-sidechat {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .inline-sidechat-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 6px;
    }
    .inline-sidechat-msg { margin: 0 0 8px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    .inline-sidechat-msg:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
    .inline-sidechat-meta { font-size: 0.82em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .inline-sidechat .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .inline-sidechat-composer { display: flex; gap: 8px; align-items: center; }
    .inline-sidechat-composer textarea {
      flex: 1;
      min-height: 54px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
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
    .badge-pvt {
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
    .msg .role .badge-pvt {
      margin-left: 8px;
      vertical-align: middle;
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
    .msg.user.pending-send {
      opacity: 0.95;
      border-left-style: dashed;
    }
    .msg.user.pending-send .pending-hint {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 6px 0;
    }
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
    .thread .msg .thread-checkpoint {
      font-size: 0.92em;
      font-weight: 500;
      color: var(--vscode-descriptionForeground);
      margin: -2px 0 6px 0;
    }
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
    .thread .msg .body.md .msg-user-image {
      margin: 0.5em 0 0;
    }
    .thread .msg .body.md .msg-user-image img {
      display: block;
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }
    .composer-pending-images {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
      margin-top: 6px;
    }
    .composer-pending-images .pending-thumb-wrap {
      position: relative;
    }
    .composer-pending-images .pending-thumb {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
    }
    .composer-pending-images button.remove-pending {
      position: absolute;
      top: -6px;
      right: -6px;
      padding: 0 5px;
      font-size: 0.75em;
      line-height: 1.2;
      border-radius: 999px;
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
    .composer .checkpoint-label-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 8px 0 0;
      max-width: 52em;
    }
    .composer #checkpointLabel {
      box-sizing: border-box;
      width: 100%;
      padding: 6px 8px;
      font-family: inherit;
      font-size: 0.95em;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    .legal-policy-strip {
      display: none;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin: 6px 0 0;
      max-width: 100%;
    }
    .legal-policy-strip .policy-lead {
      margin-right: 2px;
    }
  </style>
</head>
<body>
  <div id="err" class="err" style="display:none"></div>
  <div class="menubar" role="menubar" aria-label="Colcoor">
        <div class="menu-root">
          <button type="button" class="menu-root-btn" id="menuBtnConversation" aria-haspopup="true" aria-expanded="false" aria-controls="menuPanelConversation">Conversation</button>
          <div class="menu-panel" id="menuPanelConversation" role="menu" hidden>
            <button type="button" class="menu-item" role="menuitem" data-conv-action="openMembers" title="Show conversation members">Members</button>
            <button type="button" class="menu-item" role="menuitem" data-conv-action="addMember" title="Invite an editor/viewer to this conversation">Add member…</button>
            <button type="button" class="menu-item" role="menuitem" data-conv-action="changeMemberRole" title="Change a member role">Change role…</button>
            <button type="button" class="menu-item" role="menuitem" data-conv-action="removeMember" title="Remove a member from this conversation">Remove member…</button>
            <hr class="menu-sep" role="separator" />
            <button type="button" class="menu-item" role="menuitem" data-conv-action="rename">Rename…</button>
            <button type="button" class="menu-item" role="menuitem" data-conv-action="togglePin">Pin</button>
            <button type="button" class="menu-item" role="menuitem" data-conv-action="deleteConversation" title="Delete this conversation">Delete conversation…</button>
          </div>
        </div>
        <div class="menu-root">
          <button type="button" class="menu-root-btn" id="menuBtnMessage" aria-haspopup="true" aria-expanded="false" aria-controls="menuPanelMessage">Message</button>
          <div class="menu-panel" id="menuPanelMessage" role="menu" hidden>
            <button type="button" class="menu-item" role="menuitem" id="btnCopy">Copy message</button>
            <button type="button" class="menu-item" role="menuitem" id="btnToggleStar" title="Star or unstar the selected message">Star</button>
            <button type="button" class="menu-item" role="menuitem" id="btnCopyThread" title="Copy root → selected path as plain text">Copy thread</button>
            <button type="button" class="menu-item" role="menuitem" id="btnResend">Resend assistant</button>
            <button type="button" class="menu-item" role="menuitem" id="btnJumpTip" title="Select the newest leaf on the default branch">Jump to latest</button>
          </div>
        </div>
        <div class="menu-root">
          <button type="button" class="menu-root-btn" id="menuBtnNote" aria-haspopup="true" aria-expanded="false" aria-controls="menuPanelNote">Note</button>
          <div class="menu-panel" id="menuPanelNote" role="menu" hidden>
            <button type="button" class="menu-item" role="menuitem" id="btnAddNote" title="Attach a note to the selected message (owner/editor)">Add note…</button>
            <button type="button" class="menu-item" role="menuitem" id="btnListNotesOnSelection" title="List notes on the selected message in the Colcoor notes output">List notes…</button>
            <button type="button" class="menu-item" role="menuitem" id="btnReferenceNoteSideChat" title="Open side chat and choose a note from the selected message to reference">Reference note in side chat</button>
            <button type="button" class="menu-item" role="menuitem" id="btnTodoDrawer" title="List TODO notes in this conversation">TODO notes</button>
          </div>
        </div>
        <div class="menu-root">
          <button type="button" class="menu-root-btn" id="menuBtnView" aria-haspopup="true" aria-expanded="false" aria-controls="menuPanelView">View</button>
          <div class="menu-panel" id="menuPanelView" role="menu" hidden>
            <button type="button" class="menu-item" role="menuitem" id="btnStarredDrawer" title="List starred messages in this conversation">Starred</button>
            <button type="button" class="menu-item" role="menuitem" id="btnDrawers" title="Open the Starred/TODO drawers panel">Drawers</button>
            <button type="button" class="menu-item" role="menuitem" id="btnOpenSideChat" title="Open side chat for this conversation">Open side chat</button>
            <button type="button" class="menu-item" role="menuitem" id="btnReferenceSideChat" title="Open side chat and prefill a reference to the selected message">Reference in side chat</button>
          </div>
        </div>
        <div class="menu-root">
          <button type="button" class="menu-root-btn" id="menuBtnAccount" aria-haspopup="true" aria-expanded="false" aria-controls="menuPanelAccount">Account</button>
          <div class="menu-panel" id="menuPanelAccount" role="menu" hidden>
            <button type="button" class="menu-item" role="menuitem" data-colcoor-command="colcoor.editProfile">Profile…</button>
            <button type="button" class="menu-item" role="menuitem" data-colcoor-command="colcoor.openSettings">Extension settings…</button>
            <button type="button" class="menu-item" role="menuitem" data-colcoor-command="colcoor.openLegalPolicySettings">Legal policy URLs…</button>
            <button type="button" class="menu-item" role="menuitem" data-colcoor-command="colcoor.openSideChatSoundSettings">Side chat sounds &amp; notifications…</button>
            <hr class="menu-sep" role="separator" />
            <button type="button" class="menu-item" role="menuitem" data-colcoor-command="colcoor.setupCursorCli">Cursor CLI (agent) setup…</button>
            <button type="button" class="menu-item" role="menuitem" data-colcoor-command="colcoor.setCursorAgentApiKey">Cursor API key for agent…</button>
          </div>
        </div>
        <div class="menu-root">
          <button type="button" class="menu-root-btn" id="menuBtnHelp" aria-haspopup="true" aria-expanded="false" aria-controls="menuPanelHelp">Help</button>
          <div class="menu-panel" id="menuPanelHelp" role="menu" hidden>
            <button type="button" class="menu-item" role="menuitem" id="menuItemHelp" title="Product summary, version, and policy links">Help…</button>
          </div>
        </div>
      </div>
  <div
    id="legalPolicyStrip"
    class="legal-policy-strip hint"
    style="display:none"
    role="region"
    aria-label="Product policies"
  ></div>
  <div class="layout">
    <div class="col-tree">
      <div class="hint tree-panel-hint">Event tree — click a node to choose where the next reply attaches. Use the resize handle in the bottom-right corner of this panel to change width.</div>
      <div class="tree-scroll">
        <div id="tree" class="tree"></div>
      </div>
    </div>
    <div class="col-center">
      <div class="detail-bar">
        <div id="breadcrumb" class="crumb hint"></div>
      </div>
      <div class="thread">
        <div class="hint thread-hint">Thread (root → selected)</div>
        <div class="thread-scroll">
          <div id="thread"></div>
        </div>
      </div>
      <div class="composer">
        <textarea id="input" dir="auto" placeholder="Message… Shift+Enter for newline, Enter to send"></textarea>
        <div id="pendingConversationImages" class="composer-pending-images" style="display:none"></div>
        <div class="checkpoint-label-wrap">
          <label for="checkpointLabel" class="hint">Checkpoint label (optional)</label>
          <input
            type="text"
            id="checkpointLabel"
            maxlength="256"
            dir="auto"
            placeholder="Shown in the detail breadcrumb when set"
            aria-label="Optional checkpoint label for this message"
          />
        </div>
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
          <button id="refresh" type="button" title=${JSON.stringify(
            COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
          )}>${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}</button>
          <span class="hint" id="busy" style="display:none">Working…</span>
        </div>
      </div>
    </div>
    <div id="colSideChat" class="col-sidechat" style="display:none" aria-hidden="true">
      <div class="hint sidechat-panel-hint" style="flex-shrink:0;margin-bottom:4px;">
        Side chat — use the resize handle in the bottom-right corner of this panel to change width.
      </div>
      <div id="inlineSideChat" class="inline-sidechat">
        <div class="row" style="flex-shrink:0;margin:0;">
          <div class="hint" style="margin:0;">Same tab</div>
          <button type="button" id="btnCloseSideChat" class="btn-secondary">Close side chat</button>
          <button type="button" id="btnRefreshSideChat" class="btn-secondary">Refresh</button>
        </div>
        <div id="inlineSideChatList" class="inline-sidechat-list"></div>
        <div class="inline-sidechat-composer" style="flex-shrink:0;">
          <textarea id="inlineSideChatInput" dir="auto" placeholder="Side chat… Shift+Enter for newline, Enter to send."></textarea>
          <button type="button" id="btnInlineSideChatSend" class="btn-secondary">Send</button>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let hasReceivedState = false;
    var pendingSendImages = [];
    function renderPendingConversationImages() {
      var el = document.getElementById("pendingConversationImages");
      if (!el) return;
      el.replaceChildren();
      if (!pendingSendImages.length) {
        el.style.display = "none";
        return;
      }
      el.style.display = "flex";
      pendingSendImages.forEach(function (item) {
        var url = item && item.dataUrl ? String(item.dataUrl) : "";
        if (!url) return;
        var wrap = document.createElement("div");
        wrap.className = "pending-thumb-wrap";
        var im = document.createElement("img");
        im.className = "pending-thumb";
        im.alt = "";
        im.src = url;
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "btn-secondary remove-pending";
        rm.textContent = "×";
        rm.title = "Remove image";
        rm.addEventListener("click", function () {
          pendingSendImages = pendingSendImages.filter(function (x) {
            return !x || String(x.dataUrl || "") !== url;
          });
          renderPendingConversationImages();
          updateComposerSendEnabled();
        });
        wrap.appendChild(im);
        wrap.appendChild(rm);
        el.appendChild(wrap);
      });
    }
    let state = {
      conversationId: "",
      title: null,
      conversationPinned: false,
      events: [],
      selectedEventId: "",
      threadSegments: [],
      threadPlainText: "",
      treeWidthPx: null,
      sideChatColumnWidthPx: null,
      /** Host workspace persistence; bounds match composerLayoutPersistence.ts (72–800). */
      composerTextareaHeightPx: null,
      agentTraceOpen: true,
      needsContextRebuild: false,
      busy: false,
      lastError: null,
      legalPolicyLinks: [],
      sideChatOpenButtonLabel: "Open side chat",
      sideChatOpenButtonTitle: "Open side chat for this conversation",
      sideChatVisible: false,
      sideChatMessages: [],
      // Sanitized HTML for in-flight assistant text; cleared when the host sends a full state snapshot.
      streamingHtml: null,
      pendingUserHtml: null,
      /** Event ids whose child branches are collapsed in the indented tree (client-only; [tree-ui-contract.md]). */
      treeCollapsedIds: {},
    };

    var menubarOpenId = null;
    function closeAllMenus() {
      menubarOpenId = null;
      document.querySelectorAll(".menu-panel").forEach(function (p) {
        p.hidden = true;
      });
      document.querySelectorAll(".menu-root-btn").forEach(function (b) {
        b.setAttribute("aria-expanded", "false");
        b.classList.remove("menu-open");
      });
    }
    function toggleMenu(menuId) {
      var panel = document.getElementById("menuPanel" + menuId);
      var btn = document.getElementById("menuBtn" + menuId);
      var wasOpen = menubarOpenId === menuId;
      closeAllMenus();
      if (!wasOpen && panel && btn) {
        menubarOpenId = menuId;
        panel.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        btn.classList.add("menu-open");
      }
    }
    function wireMenubar() {
      var bar = document.querySelector(".menubar");
      if (!bar) return;
      ["Conversation", "Message", "Note", "View", "Account", "Help"].forEach(function (id) {
        var b = document.getElementById("menuBtn" + id);
        if (!b) return;
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          toggleMenu(id);
        });
      });
      document.addEventListener(
        "mousedown",
        function (ev) {
          if (!ev.target.closest(".menubar")) closeAllMenus();
        },
        true,
      );
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") closeAllMenus();
      });
      bar.addEventListener("click", function (ev) {
        if (!ev.target.closest(".menu-panel")) return;
        var convAct = ev.target.closest("[data-conv-action]");
        if (convAct && !convAct.disabled) {
          var ca = convAct.getAttribute("data-conv-action");
          if (ca === "openMembers") vscode.postMessage({ type: "openMembers" });
          else if (ca === "addMember") vscode.postMessage({ type: "addMember" });
          else if (ca === "changeMemberRole") vscode.postMessage({ type: "changeMemberRole" });
          else if (ca === "removeMember") vscode.postMessage({ type: "removeMember" });
          else if (ca === "rename") vscode.postMessage({ type: "rename" });
          else if (ca === "togglePin") vscode.postMessage({ type: "togglePin" });
          else if (ca === "deleteConversation") vscode.postMessage({ type: "deleteConversation" });
          else return;
          closeAllMenus();
          return;
        }
        var cmdEl = ev.target.closest("[data-colcoor-command]");
        if (cmdEl && !cmdEl.disabled) {
          var cmd = cmdEl.getAttribute("data-colcoor-command");
          if (cmd) {
            vscode.postMessage({ type: "executeColcoorCommand", command: cmd });
            closeAllMenus();
            return;
          }
        }
        var h = ev.target.closest("#menuItemHelp");
        if (h && !h.disabled) {
          vscode.postMessage({ type: "openHelp" });
          closeAllMenus();
          return;
        }
        closeAllMenus();
      });
    }

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

    function applySideChatColumnWidth() {
      var el = document.getElementById("colSideChat");
      if (!el || el.style.display === "none") return;
      var sw = null;
      if (typeof state.sideChatColumnWidthPx === "number" && state.sideChatColumnWidthPx >= 160) {
        sw = state.sideChatColumnWidthPx;
      }
      if (sw == null) {
        try {
          sw = parseInt(localStorage.getItem("colcoor.sideChatColumnWidthPx"), 10);
        } catch (e2) {}
      }
      if (sw != null && sw >= 160) el.style.width = sw + "px";
    }

    (function applySavedTreeWidthColdStart() {
      try {
        var w = parseInt(localStorage.getItem("colcoor.treeWidthPx"), 10);
        var el = document.querySelector(".col-tree");
        if (el && w >= 140) el.style.width = w + "px";
      } catch (e) {}
    })();

    (function applySavedSideChatColumnWidthColdStart() {
      try {
        var sw = parseInt(localStorage.getItem("colcoor.sideChatColumnWidthPx"), 10);
        var el = document.getElementById("colSideChat");
        if (el && sw >= 160) el.style.width = sw + "px";
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

    ${treeEventTimeLabelWebviewScriptBlock()}

    function eventDisplayTitle(ev) {
      var j = ev.content_json;
      if (!j || typeof j !== "object") return "";
      var raw = j.title ?? j.message_title ?? j.display_title;
      if (typeof raw !== "string") return "";
      var s = raw.trim();
      if (!s) return "";
      return s.length > ${TREE_EVENT_DISPLAY_TITLE_MAX}
        ? s.slice(0, ${TREE_EVENT_DISPLAY_TITLE_MAX}) + "…"
        : s;
    }

    function snippet(ev) {
      const t = (ev.content_text || "").trim().replace(/\\s+/g, " ");
      if (!t) {
        if (ev.kind === "user_input" && (ev.parent_event_id == null || ev.parent_event_id === "")) {
          return "(conversation start)";
        }
        return "(empty)";
      }
      return t.length > ${TREE_EVENT_SNIPPET_MAX}
        ? t.slice(0, ${TREE_EVENT_SNIPPET_MAX}) + "…"
        : t;
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

    function graphEventIsPrivate(e) {
      return !!(e && e.visible_to != null && String(e.visible_to).trim() !== "");
    }

    function showPrivateDraftSubtreeInUi() {
      var priv = document.getElementById("privateBranch");
      return !!(priv && priv.checked);
    }

    /** Breadcrumb path: omit private nodes when the checkbox hides them. */
    function pathChainForCrumb(events, selectedId) {
      const full = pathChain(events, selectedId);
      if (showPrivateDraftSubtreeInUi()) return full;
      return full.filter(function (ev) {
        return !graphEventIsPrivate(ev);
      });
    }

    function effectiveTreeParentKey(e, byId, shownIds, showPrivate) {
      if (showPrivate) {
        return e.parent_event_id == null ? "__root__" : String(e.parent_event_id);
      }
      var p = e.parent_event_id;
      while (p != null) {
        if (shownIds.has(p)) return String(p);
        var par = byId[p];
        if (!par) return "__root__";
        p = par.parent_event_id;
      }
      return "__root__";
    }

    function clampSelectionIfPrivateHidden() {
      if (showPrivateDraftSubtreeInUi()) return;
      var evs = state.events || [];
      var sid = state.selectedEventId;
      if (!sid) return;
      var byId = Object.fromEntries(evs.map(function (x) {
        return [x.id, x];
      }));
      var cur = byId[sid];
      if (!cur || !graphEventIsPrivate(cur)) return;
      while (cur && graphEventIsPrivate(cur)) {
        var pid = cur.parent_event_id;
        if (pid == null) {
          vscode.postMessage({ type: "selectTip" });
          return;
        }
        cur = byId[pid];
        if (!cur) {
          vscode.postMessage({ type: "selectTip" });
          return;
        }
      }
      if (cur && cur.id) vscode.postMessage({ type: "select", id: cur.id });
    }

    function visibleThreadSegmentsForUi() {
      var segs = state.threadSegments || [];
      if (showPrivateDraftSubtreeInUi()) return segs;
      return segs.filter(function (s) {
        return s.privateScope !== true;
      });
    }

    function threadPlainTextForCopy() {
      if (showPrivateDraftSubtreeInUi()) return state.threadPlainText || "";
      var el = document.getElementById("thread");
      if (el) {
        var t = (el.innerText || "").trim();
        if (t.length) return el.innerText || "";
      }
      return "";
    }

    function threadHasCopyablePlainText() {
      if (showPrivateDraftSubtreeInUi()) {
        return String(state.threadPlainText || "").trim().length > 0;
      }
      var segs = visibleThreadSegmentsForUi();
      if (segs.length) return true;
      if (state.pendingUserHtml || state.streamingHtml) return true;
      return String(threadPlainTextForCopy()).trim().length > 0;
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

    function syncConversationMenuPanel() {
      var convMenuPanel = document.getElementById("menuPanelConversation");
      if (!convMenuPanel) return;
      convMenuPanel.querySelectorAll("[data-conv-action]").forEach(function (el) {
        el.disabled = state.busy;
      });
      var pin = convMenuPanel.querySelector('[data-conv-action="togglePin"]');
      if (pin) {
        pin.textContent = state.conversationPinned ? "Unpin" : "Pin";
      }
    }

    function renderDetailBar() {
      const crumb = document.getElementById("breadcrumb");
      const copyBtn = document.getElementById("btnCopy");
      const toggleStarBtn = document.getElementById("btnToggleStar");
      const copyThreadBtn = document.getElementById("btnCopyThread");
      const refSideChatBtn = document.getElementById("btnReferenceSideChat");
      const refNoteSideChatBtn = document.getElementById("btnReferenceNoteSideChat");
      const addNoteBtn = document.getElementById("btnAddNote");
      const listNotesOnSelectionBtn = document.getElementById("btnListNotesOnSelection");
      const starredDrawerBtn = document.getElementById("btnStarredDrawer");
      const todoDrawerBtn = document.getElementById("btnTodoDrawer");
      const drawersBtn = document.getElementById("btnDrawers");
      const openSideChatBtn = document.getElementById("btnOpenSideChat");
      const resendBtn = document.getElementById("btnResend");
      if (
        !crumb ||
        !copyBtn ||
        !toggleStarBtn ||
        !resendBtn ||
        !refSideChatBtn ||
        !refNoteSideChatBtn ||
        !addNoteBtn ||
        !listNotesOnSelectionBtn
      )
        return;
      if (starredDrawerBtn) starredDrawerBtn.disabled = state.busy;
      if (todoDrawerBtn) todoDrawerBtn.disabled = state.busy;
      if (drawersBtn) drawersBtn.disabled = state.busy;
      if (openSideChatBtn) {
        openSideChatBtn.disabled = state.busy;
        openSideChatBtn.textContent =
          typeof state.sideChatOpenButtonLabel === "string" && state.sideChatOpenButtonLabel.trim()
            ? state.sideChatOpenButtonLabel
            : "Open side chat";
        openSideChatBtn.title =
          typeof state.sideChatOpenButtonTitle === "string" && state.sideChatOpenButtonTitle.trim()
            ? state.sideChatOpenButtonTitle
            : "Open side chat for this conversation";
      }
      document.querySelectorAll("[data-colcoor-command]").forEach(function (el) {
        el.disabled = state.busy;
      });
      var menuHelp = document.getElementById("menuItemHelp");
      if (menuHelp) menuHelp.disabled = state.busy;
      const sel = state.selectedEventId;
      const evs = state.events || [];
      const path = pathChainForCrumb(evs, sel);
      const bySel = Object.fromEntries(evs.map((e) => [e.id, e]));
      const last = bySel[sel] || (path.length ? path[path.length - 1] : null);
      if (!path.length || !last) {
        crumb.innerHTML = '<span class="empty">No selection</span>';
        copyBtn.disabled = true;
        toggleStarBtn.disabled = true;
        refSideChatBtn.disabled = true;
        refNoteSideChatBtn.disabled = true;
        resendBtn.disabled = true;
        if (copyThreadBtn) copyThreadBtn.disabled = true;
        addNoteBtn.disabled = true;
        addNoteBtn.title = "Select a message in the tree first.";
        listNotesOnSelectionBtn.disabled = true;
        listNotesOnSelectionBtn.title = "Select a message in the tree first.";
        toggleStarBtn.textContent = "Star";
        toggleStarBtn.title = "Select a message in the tree to star or unstar.";
        const jumpBtnEmpty = document.getElementById("btnJumpTip");
        if (jumpBtnEmpty) jumpBtnEmpty.disabled = state.busy;
      } else {
      const parts = path.map((ev) => {
        const lab = ev.kind === "user_input" ? "User" : "Assistant";
        var cpRaw = ev && typeof ev.checkpoint_label === "string" ? ev.checkpoint_label.trim() : "";
        var cpHtml = "";
        if (cpRaw) {
          cpHtml =
            ' · <span class="crumb-checkpoint">' + esc("Checkpoint: " + cpRaw) + "</span>";
        }
        return (
          '<span class="crumb-step"><strong>' +
          esc(lab) +
          "</strong> · " +
          esc(snippet(ev)) +
          cpHtml +
          "</span>"
        );
      });
      crumb.innerHTML = parts.join(' <span class="crumb-sep">→</span> ');
      copyBtn.disabled = state.busy;
      toggleStarBtn.disabled = state.busy;
      toggleStarBtn.textContent = last.starred === true ? "Unstar" : "Star";
      toggleStarBtn.title =
        last.starred === true
          ? "Remove your star from this message."
          : "Star this message (visible in Starred drawer).";
      addNoteBtn.disabled = state.busy;
      addNoteBtn.title = state.busy
        ? "Wait for the current operation to finish."
        : "Attach a note to the selected message (owner/editor).";
      listNotesOnSelectionBtn.disabled = state.busy;
      listNotesOnSelectionBtn.title = state.busy
        ? "Wait for the current operation to finish."
        : "List notes on the selected message in the Colcoor notes output.";
      refSideChatBtn.disabled = state.busy;
      refSideChatBtn.title = state.busy
        ? "Wait for the current operation to finish."
        : "Open side chat with a reference to the selected message.";
      refNoteSideChatBtn.disabled = state.busy;
      refNoteSideChatBtn.title = state.busy
        ? "Wait for the current operation to finish."
        : "Open side chat and pick a note from the selected message.";
      const canCopyThread = threadHasCopyablePlainText();
      if (copyThreadBtn) {
        copyThreadBtn.disabled = state.busy || !canCopyThread;
        copyThreadBtn.title = canCopyThread
          ? "Copy the visible thread (root → selected) as plain text"
          : "Nothing to copy on this path yet.";
      }
      const canResend =
        last &&
        last.kind === "user_input" &&
        String(last.content_text || "").trim().length > 0;
      resendBtn.disabled = state.busy || !canResend;
      resendBtn.title = canResend
        ? "New assistant reply for this user message (same user row; transcript per docs)."
        : "Pick a user message with text (not the empty root placeholder).";
      const jumpBtn = document.getElementById("btnJumpTip");
      if (jumpBtn) jumpBtn.disabled = state.busy;
      }
      syncConversationMenuPanel();
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

    var sideChatResizeObserver = null;
    function wireSideChatResize() {
      var el = document.getElementById("colSideChat");
      if (sideChatResizeObserver) {
        sideChatResizeObserver.disconnect();
        sideChatResizeObserver = null;
      }
      if (!el || typeof ResizeObserver === "undefined") return;
      if (el.style.display === "none") return;
      var tid = null;
      sideChatResizeObserver = new ResizeObserver(function () {
        if (tid) clearTimeout(tid);
        tid = setTimeout(function () {
          try {
            var sw = el.offsetWidth;
            if (sw >= 160) {
              localStorage.setItem("colcoor.sideChatColumnWidthPx", String(sw));
              vscode.postMessage({ type: "layout", sideChatColumnWidthPx: sw });
            }
          } catch (e) {}
        }, 250);
      });
      sideChatResizeObserver.observe(el);
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
      const showPrivate = showPrivateDraftSubtreeInUi();
      const byId = Object.fromEntries(evs.map((e) => [e.id, e]));
      const treeEvents = showPrivate ? evs : evs.filter((e) => !graphEventIsPrivate(e));
      const shownIds = new Set(treeEvents.map((e) => e.id));
      const byParent = new Map();
      for (const e of treeEvents) {
        const k = effectiveTreeParentKey(e, byId, shownIds, showPrivate);
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
          const isPriv = graphEventIsPrivate(e);
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
      const segs = visibleThreadSegmentsForUi();
      if (!segs.length && !state.pendingUserHtml && !state.streamingHtml) {
        el.innerHTML = '<p class="empty">Select an event in the tree.</p>';
        return;
      }
      let html = "";
      for (const s of segs) {
        const cls = s.role === "user" ? "user" : "assistant";
        const role = s.role === "user" ? "User" : "Assistant";
        const privBadge =
          s.privateScope === true ? '<span class="badge-pvt">Private</span>' : "";
        html +=
          '<div class="msg ' +
          cls +
          '"><div class="role">' +
          role +
          privBadge +
          "</div>" +
          (s.checkpointLabel
            ? '<div class="thread-checkpoint">' + esc("Checkpoint: " + String(s.checkpointLabel)) + "</div>"
            : "") +
          '<div class="body md" dir="auto">' +
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
        if (s.role === "assistant" && s.traceEntries && s.traceEntries.length) {
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
        }
        html += "</div>";
      }
      if (state.pendingUserHtml) {
        html +=
          '<div class="msg user pending-send"><div class="role">User</div>' +
          '<p class="pending-hint">Sending… (not on the tree until saved)</p>' +
          '<div class="body md" dir="auto">' +
          state.pendingUserHtml +
          "</div></div>";
      }
      if (state.streamingHtml) {
        html +=
          '<div class="msg assistant streaming"><div class="role">Assistant</div><div class="body md" dir="auto">' +
          state.streamingHtml +
          "</div></div>";
      }
      el.innerHTML = html || '<p class="empty">Nothing to show on this path.</p>';
    }

    function renderInlineSideChat() {
      var col = document.getElementById("colSideChat");
      var wrap = document.getElementById("inlineSideChat");
      var list = document.getElementById("inlineSideChatList");
      if (!col || !wrap || !list) return;
      if (!state.sideChatVisible) {
        col.style.display = "none";
        col.setAttribute("aria-hidden", "true");
        list.textContent = "";
        if (sideChatResizeObserver) {
          sideChatResizeObserver.disconnect();
          sideChatResizeObserver = null;
        }
        return;
      }
      col.style.display = "flex";
      col.setAttribute("aria-hidden", "false");
      var rows = Array.isArray(state.sideChatMessages) ? state.sideChatMessages : [];
      if (!rows.length) {
        list.innerHTML = '<p class="empty">No side-chat messages yet.</p>';
        return;
      }
      var html = "";
      for (var i = 0; i < rows.length; i++) {
        var m = rows[i] || {};
        var bodyHtml = typeof m.rendered_body_html === "string" ? m.rendered_body_html : esc(String(m.body || ""));
        html +=
          '<div class="inline-sidechat-msg">' +
          '<div class="inline-sidechat-meta">#' +
          esc(String(m.seq || i + 1)) +
          " · " +
          esc(String(m.kind || "user")) +
          "</div>" +
          '<div class="body md" dir="auto">' +
          bodyHtml +
          "</div></div>";
      }
      list.innerHTML = html;
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
      var hasText = ta && String(ta.value || "").trim().length > 0;
      var has = hasText || pendingSendImages.length > 0;
      sendBtn.disabled = !has;
      sendBtn.title = has
        ? ""
        : "Type a message or paste an image. Shift+Enter for newline, Enter to send.";
    }

    function shouldSendOnEnter(ev) {
      if (!ev || ev.key !== "Enter") return false;
      if (ev.isComposing) return false;
      if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return false;
      return true;
    }

    function scheduleComposerFocus(el) {
      if (!el) return;
      var run = function () {
        try {
          el.focus();
        } catch (e) {}
      };
      try {
        requestAnimationFrame(run);
      } catch (e) {
        setTimeout(run, 0);
      }
    }

    function updateLegalPolicyStrip() {
      var strip = document.getElementById("legalPolicyStrip");
      if (!strip) return;
      var links = state.legalPolicyLinks;
      if (!links || !links.length) {
        strip.style.display = "none";
        strip.replaceChildren();
        return;
      }
      strip.style.display = "flex";
      strip.replaceChildren();
      var lead = document.createElement("span");
      lead.className = "policy-lead";
      lead.textContent = "Policies:";
      strip.appendChild(lead);
      for (var i = 0; i < links.length; i++) {
        var row = links[i];
        if (!row || !row.url || !row.label) continue;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn-secondary";
        b.textContent = row.label;
        b.setAttribute("data-url", row.url);
        b.title = "Open in browser — " + row.url;
        strip.appendChild(b);
      }
    }

    (function wireLegalPolicyStripClicks() {
      var strip = document.getElementById("legalPolicyStrip");
      if (!strip) return;
      strip.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || t.tagName !== "BUTTON") return;
        var u = t.getAttribute("data-url");
        if (u) vscode.postMessage({ type: "openLegalPolicyUrl", url: u });
      });
    })();

    function render() {
      try {
        const errEl = document.getElementById("err");
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
        updateLegalPolicyStrip();
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
        var cpEl = document.getElementById("checkpointLabel");
        if (cpEl) cpEl.disabled = state.busy;
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
        clampSelectionIfPrivateHidden();
        renderTree();
        renderThread();
        renderInlineSideChat();
        renderDetailBar();
        applyTreeWidth();
        applySideChatColumnWidth();
        wireTreeResize();
        wireSideChatResize();
        wireComposerResize();
      } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e);
        const errEl = document.getElementById("err");
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = "Colcoor webview render error: " + msg;
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
          if (nid) {
            state.selectedEventId = nid;
            try {
              var prev = root.querySelector(".node.selected");
              if (prev) prev.classList.remove("selected");
              node.classList.add("selected");
            } catch (e2) {}
            vscode.postMessage({ type: "select", id: nid });
          }
        }
      });
      root.addEventListener("contextmenu", function (ev) {
        var node = ev.target.closest && ev.target.closest(".node");
        if (!node) return;
        var nid = node.getAttribute("data-id");
        if (!nid) return;
        ev.preventDefault();
        vscode.postMessage({ type: "treeContextMenu", id: nid });
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
        state = {
          ...m,
          streamingHtml: null,
          treeCollapsedIds: collapsedFromHost,
          legalPolicyLinks: Array.isArray(m.legalPolicyLinks) ? m.legalPolicyLinks : [],
        };
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
      var errEl = document.getElementById("err");
      if (!errEl) return;
      errEl.style.display = "block";
      errEl.textContent =
        "Still waiting for a conversation snapshot from the extension. API calls time out after 30s — check Settings → Colcoor → backend base URL, that the API is running, and sign-in — then click " +
        ${JSON.stringify(COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL)} +
        ".";
    }, 32000);

    document.getElementById("send").addEventListener("click", () => {
      const ta = document.getElementById("input");
      const text = ta && ta.value ? ta.value.trim() : "";
      const imgs = pendingSendImages.slice();
      if (!text && !imgs.length) return;
      const priv = document.getElementById("privateBranch");
      const privateBranch = priv && priv.checked;
      const cpEl = document.getElementById("checkpointLabel");
      var cpRaw = cpEl && cpEl.value ? String(cpEl.value) : "";
      var cpTrim = cpRaw.trimEnd();
      var payload = { type: "send", text: ta.value.trimEnd(), privateBranch };
      if (cpTrim.length) payload.checkpointLabel = cpTrim;
      if (imgs.length) payload.images = imgs;
      vscode.postMessage(payload);
      ta.value = "";
      if (cpEl) cpEl.value = "";
      pendingSendImages = [];
      renderPendingConversationImages();
      updateComposerSendEnabled();
      scheduleComposerFocus(ta);
    });

    document.getElementById("stop").addEventListener("click", () => {
      vscode.postMessage({ type: "cancel" });
    });

    document.getElementById("refresh").addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });

    (function wirePrivateBranchUiFilter() {
      var priv = document.getElementById("privateBranch");
      if (!priv) return;
      priv.addEventListener("change", function () {
        clampSelectionIfPrivateHidden();
        render();
      });
    })();

    document.getElementById("btnCopy").addEventListener("click", () => {
      const ev = (state.events || []).find((e) => e.id === state.selectedEventId);
      if (!ev) return;
      vscode.postMessage({ type: "copy", text: ev.content_text || "" });
    });

    document.getElementById("btnToggleStar").addEventListener("click", () => {
      vscode.postMessage({ type: "toggleStar" });
    });

    document.getElementById("btnAddNote").addEventListener("click", () => {
      vscode.postMessage({ type: "addNote" });
    });

    document.getElementById("btnListNotesOnSelection").addEventListener("click", () => {
      vscode.postMessage({ type: "listNotesOnSelection" });
    });

    document.getElementById("btnCopyThread").addEventListener("click", () => {
      var text = threadPlainTextForCopy();
      const t = String(text || "").trim();
      if (!t) return;
      vscode.postMessage({ type: "copyThread", text: text });
    });

    document.getElementById("btnResend").addEventListener("click", () => {
      vscode.postMessage({ type: "resend" });
    });

    document.getElementById("btnReferenceSideChat").addEventListener("click", () => {
      vscode.postMessage({ type: "referenceInSideChat" });
    });

    document.getElementById("btnReferenceNoteSideChat").addEventListener("click", () => {
      vscode.postMessage({ type: "referenceNoteInSideChat" });
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
    document.getElementById("btnCloseSideChat").addEventListener("click", () => {
      vscode.postMessage({ type: "closeSideChat" });
    });
    document.getElementById("btnRefreshSideChat").addEventListener("click", () => {
      vscode.postMessage({ type: "refreshSideChat" });
    });
    document.getElementById("btnInlineSideChatSend").addEventListener("click", () => {
      var ta = document.getElementById("inlineSideChatInput");
      var text = ta && ta.value ? String(ta.value) : "";
      var trimmed = text.trimEnd();
      if (!String(trimmed).trim()) return;
      vscode.postMessage({ type: "sendSideChat", text: trimmed });
      if (ta) ta.value = "";
      scheduleComposerFocus(ta);
    });
    wireMenubar();

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

    document.getElementById("input").addEventListener("paste", function (ev) {
      var cd = ev.clipboardData;
      if (!cd || !cd.items || !cd.items.length) return;
      var files = [];
      for (var i = 0; i < cd.items.length; i++) {
        var it = cd.items[i];
        if (it.kind === "file" && String(it.type || "").indexOf("image/") === 0) {
          var f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return;
      ev.preventDefault();
      var ta = document.getElementById("input");
      var plain = cd.getData("text/plain") || "";
      if (plain && ta) {
        var start = typeof ta.selectionStart === "number" ? ta.selectionStart : (ta.value || "").length;
        var end = typeof ta.selectionEnd === "number" ? ta.selectionEnd : start;
        var v = ta.value || "";
        ta.value = v.slice(0, start) + plain + v.slice(end);
        var pos = start + plain.length;
        try {
          ta.setSelectionRange(pos, pos);
        } catch {}
      }
      files.forEach(function (blob) {
        var fr = new FileReader();
        fr.onload = function () {
          if (typeof fr.result === "string") {
            pendingSendImages.push({ dataUrl: fr.result });
            renderPendingConversationImages();
            updateComposerSendEnabled();
          }
        };
        fr.readAsDataURL(blob);
      });
    });

    document.getElementById("input").addEventListener("keydown", (e) => {
      if (!shouldSendOnEnter(e)) return;
      var sb = document.getElementById("send");
      if (sb && sb.disabled) {
        return;
      }
      e.preventDefault();
      if (sb) sb.click();
    });

    document.getElementById("inlineSideChatInput").addEventListener("keydown", function (e) {
      if (!shouldSendOnEnter(e)) return;
      var ta = document.getElementById("inlineSideChatInput");
      var raw = ta && ta.value ? String(ta.value) : "";
      if (!String(raw).trim()) return;
      e.preventDefault();
      var sb = document.getElementById("btnInlineSideChatSend");
      if (sb) sb.click();
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}
