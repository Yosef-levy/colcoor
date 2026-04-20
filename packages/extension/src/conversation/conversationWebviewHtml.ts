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
      margin-bottom: 4px;
    }
    .thread-visit-nav {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 8px 0;
    }
    .thread-visit-nav button {
      min-width: 2.25em;
      padding: 2px 8px;
      font-size: 1.05em;
      line-height: 1.35;
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
    .inline-sidechat-msg {
      margin: 8px 0;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    }
    .inline-sidechat-msg-self {
      border-left: 3px solid var(--vscode-focusBorder);
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    .inline-sidechat-msg-peer {
      border-right: 3px solid var(--vscode-focusBorder);
      background: var(--vscode-textBlockQuote-background);
    }
    .inline-sidechat-deleted {
      margin: 0;
      font-style: italic;
      color: var(--vscode-descriptionForeground);
    }
    .inline-sidechat-meta-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .inline-sidechat-meta-main {
      flex: 1;
      min-width: 0;
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
    }
    .inline-sidechat-msg-unread .inline-sidechat-meta-main {
      color: var(--vscode-charts-yellow);
    }
    /* Ghost “more” control: no chip background — only the ellipsis reads as the affordance. */
    button.inline-sidechat-msg-menu-btn {
      flex-shrink: 0;
      padding: 0 2px;
      min-width: auto;
      line-height: 1;
      font-size: 1.2em;
      letter-spacing: 0.12em;
      background: transparent !important;
      color: var(--vscode-descriptionForeground);
      border: none;
      border-radius: 0;
      box-shadow: none;
      cursor: pointer;
      opacity: 0.88;
    }
    button.inline-sidechat-msg-menu-btn:hover {
      opacity: 1;
      color: var(--vscode-foreground);
      background: transparent !important;
    }
    button.inline-sidechat-msg-menu-btn:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
    .inline-sidechat-msg-menu {
      position: fixed;
      z-index: 20000;
      min-width: 168px;
      background: var(--vscode-menu-background);
      color: var(--vscode-menu-foreground);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 4px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      padding: 4px 0;
    }
    .inline-sidechat-msg-menu[hidden] {
      display: none !important;
    }
    .inline-sidechat-msg-menu:not([hidden]) {
      display: block;
    }
    .inline-sidechat-msg-menu button {
      display: block;
      width: 100%;
      text-align: left;
      padding: 6px 14px;
      margin: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .inline-sidechat-msg-menu button:hover {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-menu-selectionForeground, var(--vscode-list-hoverForeground));
    }
    .inline-sidechat-refs { display: inline; margin-left: 6px; }
    .inline-sidechat-refs .ref-chip {
      display: inline-block;
      margin-right: 4px;
      font-size: 0.78em;
      color: var(--vscode-descriptionForeground);
    }
    .inline-sidechat-mentions { display: inline; margin-left: 6px; }
    .inline-sidechat-mentions .mention-chip {
      display: inline-block;
      margin-right: 4px;
      font-size: 0.78em;
      color: var(--vscode-textLink-foreground);
    }
    .inline-sidechat-reply-row { flex-shrink: 0; margin: 0; align-items: center; gap: 8px; }
    .inline-sidechat-reply-hint { margin: 0; font-size: 0.85em; color: var(--vscode-descriptionForeground); flex: 1; min-width: 0; }
    .inline-sidechat-msg .edit-ta {
      width: 100%;
      min-height: 3.5em;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }
    .inline-sidechat-unread {
      display: inline-block;
      margin-left: 6px;
      color: var(--vscode-charts-yellow);
      font-size: 0.75em;
      line-height: 1;
      vertical-align: middle;
    }
    .inline-sidechat .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .inline-sidechat-composer {
      display: flex;
      gap: 8px;
      align-items: center;
      position: relative;
    }
    .inline-sidechat-mention-picker {
      position: absolute;
      left: 0;
      right: 88px;
      bottom: 100%;
      margin-bottom: 6px;
      max-height: 220px;
      overflow-y: auto;
      z-index: 60;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 6px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }
    .inline-sidechat-mention-picker[hidden] {
      display: none !important;
    }
    .inline-sidechat-mention-item {
      display: block;
      width: 100%;
      margin: 0;
      padding: 8px 10px;
      border: none;
      border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      background: transparent;
      color: var(--vscode-foreground);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .inline-sidechat-mention-item:last-child {
      border-bottom: none;
    }
    .inline-sidechat-mention-item:hover,
    .inline-sidechat-mention-item.mention-item-active {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-list-hoverForeground);
    }
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
    .composer .composer-waiting-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 6px;
      flex-wrap: wrap;
    }
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
    .conversation-loading {
      flex-shrink: 0;
      display: none;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      margin-bottom: 8px;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      color: var(--vscode-descriptionForeground);
      font-size: 0.95em;
    }
    .conversation-loading-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--vscode-panel-border);
      border-top-color: var(--vscode-focusBorder);
      border-radius: 50%;
      flex-shrink: 0;
      animation: conversation-loading-spin 0.75s linear infinite;
    }
    @keyframes conversation-loading-spin {
      to {
        transform: rotate(360deg);
      }
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
    /* Nested list = one indent column; same line style, hue cycles by depth ([tree-ui-contract.md]). */
    .tree-branch > ul.tree-nested {
      list-style: none;
      margin: 6px 0 0 0;
      padding: 0 0 4px 14px;
      border-left-width: 2px;
      border-left-style: solid;
    }
    /* Blend chart hues into editor background so guides stay readable but not loud. */
    .tree-branch > ul.tree-guide-l0 {
      border-left-color: color-mix(
        in srgb,
        var(--vscode-charts-blue, #4a7ab0) 22%,
        var(--vscode-editor-background) 78%
      );
    }
    .tree-branch > ul.tree-guide-l1 {
      border-left-color: color-mix(
        in srgb,
        var(--vscode-charts-orange, #b87a35) 22%,
        var(--vscode-editor-background) 78%
      );
    }
    .tree-branch > ul.tree-guide-l2 {
      border-left-color: color-mix(
        in srgb,
        var(--vscode-charts-purple, #8f6faf) 22%,
        var(--vscode-editor-background) 78%
      );
    }
    .tree-branch > ul.tree-guide-l3 {
      border-left-color: color-mix(
        in srgb,
        var(--vscode-charts-green, #4a8f6a) 22%,
        var(--vscode-editor-background) 78%
      );
    }
    .tree-branch > ul.tree-guide-l4 {
      border-left-color: color-mix(
        in srgb,
        var(--vscode-charts-yellow, #9a8530) 20%,
        var(--vscode-editor-background) 80%
      );
    }
    .tree-branch > ul.tree-guide-l5 {
      border-left-color: color-mix(
        in srgb,
        var(--vscode-charts-red, #a85a50) 22%,
        var(--vscode-editor-background) 78%
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
    .node-msg-title {
      font-size: 0.8em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      line-height: 1.35;
      margin-bottom: 3px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    .node-msg-title::before {
      content: "Title: ";
      font-weight: 600;
      color: var(--vscode-foreground);
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
    .msg { margin: 8px 0; padding: 8px; border-radius: 4px; }
    .msg.user {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-left: 3px solid var(--vscode-focusBorder);
    }
    .msg.user.pending-send {
      opacity: 0.95;
      border-left-style: dashed;
    }
    .msg.user.pending-send .pending-hint {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 6px 0;
    }
    .msg.assistant {
      background: var(--vscode-textBlockQuote-background);
      border-right: 3px solid var(--vscode-focusBorder);
    }
    .msg.assistant.streaming { box-shadow: inset 0 0 0 1px var(--vscode-focusBorder, var(--vscode-panel-border)); }
    .msg.assistant.assistant-waiting {
      opacity: 0.95;
      border-right-style: dashed;
    }
    .msg.assistant.assistant-waiting .pending-hint {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 6px 0;
    }
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
    .thread .msg .thread-msg-title {
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
    .search-drawer-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 120;
      background: rgba(0, 0, 0, 0.35);
    }
    .search-drawer-backdrop.open {
      display: block;
    }
    .search-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(420px, 100vw);
      max-width: 100%;
      z-index: 121;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
      border-left: 1px solid var(--vscode-panel-border);
      box-shadow: -4px 0 18px rgba(0, 0, 0, 0.18);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.18s ease;
    }
    .search-drawer.open {
      transform: translateX(0);
    }
    .search-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 600;
    }
    .search-drawer-body {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 0;
      flex: 1;
    }
    .search-drawer-scopes {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.92em;
    }
    .search-drawer-scopes label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .search-drawer-input {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      font-family: inherit;
      font-size: 0.95em;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
    }
    .search-drawer-results {
      flex: 1;
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .search-drawer-results ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .search-drawer-results li {
      margin: 0;
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
    }
    .search-drawer-results li:last-child {
      border-bottom: none;
    }
    .search-drawer-results li:hover,
    .search-drawer-results li:focus {
      background: var(--vscode-list-hoverBackground);
      outline: none;
    }
    .search-drawer-results .hit-kind {
      font-size: 0.78em;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .search-drawer-results .hit-title {
      font-weight: 600;
      margin-bottom: 2px;
    }
    .search-drawer-results .hit-snippet {
      font-size: 0.88em;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lists-drawer-tabs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .lists-drawer-tabs .lists-tab {
      font-family: inherit;
      font-size: 0.92em;
      padding: 4px 10px;
      cursor: pointer;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .lists-drawer-tabs .lists-tab[aria-selected="true"] {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
  </style>
</head>
<body>
  <div id="err" class="err" style="display:none"></div>
  <div
    id="conversationLoading"
    class="conversation-loading"
    style="display: none"
    role="status"
    aria-live="polite"
    aria-busy="false"
  >
    <span class="conversation-loading-spinner" aria-hidden="true"></span>
    <span>Loading conversation…</span>
  </div>
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
            <button type="button" class="menu-item" role="menuitem" id="btnStarredDrawer" title="Starred messages in this conversation (slide-in drawer)">Starred</button>
            <button type="button" class="menu-item" role="menuitem" id="btnEditMessageTitle" title="Set or clear the display-only title for the selected message (owner/editor)">Add/edit title…</button>
            <button type="button" class="menu-item" role="menuitem" id="btnCopyThread" title="Copy root → selected path as plain text">Copy thread</button>
            <button type="button" class="menu-item" role="menuitem" id="btnReferenceSideChat" title="Open side chat and prefill a reference to the selected message">Reference in side chat</button>
            <button type="button" class="menu-item" role="menuitem" id="btnResend">Resend assistant</button>
            <button type="button" class="menu-item" role="menuitem" id="btnJumpTip" title="Select the newest leaf on the default branch">Jump to latest</button>
            <hr class="menu-sep" role="separator" />
            <button type="button" class="menu-item" role="menuitem" id="btnDeleteMessageBranch" title="Delete the selected message and all replies under it (owner/editor)">Delete message branch…</button>
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
            <button type="button" class="menu-item" role="menuitem" id="btnOpenSearch" title="Search this conversation, notes, and side chat (also − outside fields)">Search…</button>
            <button type="button" class="menu-item" role="menuitem" id="btnStarredTodoDrawer" title="Starred messages and TODO notes (slide-in drawer; remembers last tab)">Starred &amp; TODO</button>
            <button type="button" class="menu-item" role="menuitem" id="btnOpenSideChat" title="Open side chat for this conversation">Open side chat</button>
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
            <hr class="menu-sep" role="separator" />
            <button type="button" class="menu-item" role="menuitem" data-colcoor-command="colcoor.signOut">Sign out</button>
          </div>
        </div>
        <div class="menu-root">
          <button type="button" class="menu-root-btn" id="menuBtnHelp" aria-haspopup="true" aria-expanded="false" aria-controls="menuPanelHelp">Help</button>
          <div class="menu-panel" id="menuPanelHelp" role="menu" hidden>
            <button type="button" class="menu-item" role="menuitem" id="menuItemHelp" title="Product summary, version, and policy links">Help…</button>
          </div>
        </div>
      </div>
  <div id="searchDrawerBackdrop" class="search-drawer-backdrop" aria-hidden="true"></div>
  <div
    id="searchDrawer"
    class="search-drawer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="searchDrawerTitle"
    aria-hidden="true"
  >
    <div class="search-drawer-header">
      <span id="searchDrawerTitle">Search</span>
      <button type="button" id="searchDrawerClose" class="btn-secondary">Close</button>
    </div>
    <div class="search-drawer-body">
      <div class="search-drawer-scopes">
        <label><input type="checkbox" id="searchScopeConv" checked /> Conversation (content)</label>
        <label><input type="checkbox" id="searchScopeTitles" checked /> Message titles</label>
        <label><input type="checkbox" id="searchScopeNotes" checked /> Notes</label>
        <label><input type="checkbox" id="searchScopeSidechat" checked /> Side chat</label>
      </div>
      <input
        type="search"
        id="searchDrawerQuery"
        class="search-drawer-input"
        placeholder="Search…"
        autocomplete="off"
        aria-label="Search query"
      />
      <div class="search-drawer-results" id="searchDrawerResultsWrap">
        <ul id="searchDrawerResultsList"></ul>
      </div>
    </div>
  </div>
  <div id="listsDrawerBackdrop" class="search-drawer-backdrop" aria-hidden="true"></div>
  <div
    id="listsDrawer"
    class="search-drawer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="listsDrawerTitle"
    aria-hidden="true"
  >
    <div class="search-drawer-header">
      <span id="listsDrawerTitle">Starred &amp; TODO</span>
      <button type="button" id="listsDrawerClose" class="btn-secondary">Close</button>
    </div>
    <div class="search-drawer-body">
      <div class="lists-drawer-tabs">
        <button type="button" class="lists-tab" id="listsTabStarred" aria-selected="true">Starred</button>
        <button type="button" class="lists-tab" id="listsTabTodo" aria-selected="false">TODO</button>
        <button type="button" id="listsDrawerRefresh" class="btn-secondary" title="Reload conversation tree from server">
          Refresh
        </button>
      </div>
      <div class="search-drawer-results" id="listsDrawerResultsWrap">
        <ul id="listsDrawerStarredList"></ul>
        <ul id="listsDrawerTodoList" style="display: none"></ul>
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
      <div class="thread">
        <div class="hint thread-hint">Thread (root → selected)</div>
        <div class="thread-visit-nav" role="group" aria-label="Visited tree selection">
          <button
            type="button"
            id="btnSelectionHistoryBack"
            class="btn-secondary"
            disabled
            title="Previous visited tree selection (this session only; Alt+← when not typing in a field)"
            aria-label="Previous visited selection"
          >
            ←
          </button>
          <button
            type="button"
            id="btnSelectionHistoryForward"
            class="btn-secondary"
            disabled
            title="Next visited selection after Back (this session only; Alt+→ when not typing in a field)"
            aria-label="Next visited selection"
          >
            →
          </button>
        </div>
        <div class="thread-scroll">
          <div id="thread"></div>
        </div>
      </div>
      <div class="composer">
        <textarea id="input" dir="auto" placeholder="Message… Shift+Enter for newline, Enter to send"></textarea>
        <div id="pendingConversationImages" class="composer-pending-images" style="display:none"></div>
        <label id="privateBranchLabel" class="priv hint" title="${PRIVATE_BRANCH_LABEL_TITLE}">
          <input type="checkbox" id="privateBranch" title="${PRIVATE_BRANCH_LABEL_TITLE}" aria-describedby="privateBranchHelp" />
          <span class="priv-body">
            <span class="priv-lead">${PRIVATE_BRANCH_LEAD}</span>
            <span id="privateBranchHelp" class="priv-desc">${PRIVATE_BRANCH_DESCRIPTION}</span>
          </span>
        </label>
        <div id="composerWhileWaitingRow" class="row composer-waiting-row" style="display:none">
          <span class="hint" id="composerWhileWaitingHint">Assistant is replying — you can:</span>
          <button type="button" id="btnQueueAfterReply" class="btn-secondary" disabled>
            Queue after reply
          </button>
          <button type="button" id="btnNewBranchWhileBusy" class="btn-secondary" disabled>
            New branch
          </button>
          <span class="hint" id="queuedSendBadge" style="display:none"></span>
        </div>
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
        <div id="inlineSideChatMsgMenu" class="inline-sidechat-msg-menu" role="menu" hidden></div>
        <div id="inlineSideChatReplyRow" class="row inline-sidechat-reply-row" style="display:none">
          <span id="inlineSideChatReplyHint" class="inline-sidechat-reply-hint" role="status"></span>
          <button type="button" id="btnClearInlineSideChatReply" class="btn-secondary">Clear reply</button>
        </div>
        <div class="inline-sidechat-composer" style="flex-shrink:0;">
          <div id="inlineSideChatMentionPicker" class="inline-sidechat-mention-picker" hidden></div>
          <textarea
            id="inlineSideChatInput"
            dir="auto"
            placeholder="Side chat… Type @ to mention a member. Shift+Enter for newline, Enter to send."
          ></textarea>
          <div id="pendingInlineSideChatImages" class="composer-pending-images" style="display:none"></div>
          <button type="button" id="btnInlineSideChatSend" class="btn-secondary">Send</button>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let hasReceivedState = false;
    var audioCtx = null;
    function playInlineSideChatTone(freq, durationMs, gainValue) {
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
          try {
            osc.stop();
          } catch (e1) {}
          try {
            osc.disconnect();
          } catch (e2) {}
          try {
            gain.disconnect();
          } catch (e3) {}
        }, durationMs);
      } catch (e) {
        /* audio unsupported */
      }
    }
    function playInlineSideChatSound(kind) {
      if (kind === "mention") {
        playInlineSideChatTone(880, 110, 0.06);
        setTimeout(function () {
          playInlineSideChatTone(988, 120, 0.06);
        }, 120);
        return;
      }
      playInlineSideChatTone(740, 120, 0.05);
    }
    var inlineSideChatReplyTargetId = null;
    var inlineSideChatMentionSelIndex = 0;
    var inlineSideChatMentionLastMatches = [];
    var pendingSendImages = [];
    var pendingInlineSideChatImages = [];
    /** After local inline side-chat send: scroll list when host state catches up; do not scroll on passive refresh. */
    var pendingInlineSideChatScrollAfterSend = false;
    var inlineSideChatRowCountWhenSent = 0;
    var inlineSideChatScrollAfterSendTimer = null;
    var prevSideChatPanelOpen = false;
    var prevConversationIdForSideChatScroll = "";
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

    function renderPendingInlineSideChatImages() {
      var el = document.getElementById("pendingInlineSideChatImages");
      if (!el) return;
      el.replaceChildren();
      if (!pendingInlineSideChatImages.length) {
        el.style.display = "none";
        return;
      }
      el.style.display = "flex";
      pendingInlineSideChatImages.forEach(function (item) {
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
          pendingInlineSideChatImages = pendingInlineSideChatImages.filter(function (x) {
            return !x || String(x.dataUrl || "") !== url;
          });
          renderPendingInlineSideChatImages();
          updateInlineSideChatSendEnabled();
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
      conversationLoading: false,
      lastError: null,
      legalPolicyLinks: [],
      sideChatOpenButtonLabel: "Open side chat",
      sideChatOpenButtonTitle: "Open side chat for this conversation",
      sideChatUnreadCount: 0,
      sideChatLastReadSeq: 0,
      viewerUserId: null,
      sideChatViewerRole: null,
      sideChatVisible: false,
      sideChatMessages: [],
      // Sanitized HTML for in-flight assistant text; cleared when the host sends a full state snapshot.
      streamingHtml: null,
      pendingUserHtml: null,
      /** Event ids whose child branches are collapsed in the indented tree (client-only; [tree-ui-contract.md]). */
      treeCollapsedIds: {},
      conversationNotes: [],
      drawersStarred: [],
      drawersTodos: [],
      selectionVisitCanGoBack: false,
      selectionVisitCanGoForward: false,
      waitingForAssistant: false,
      queuedMainSendCount: 0,
      sideChatMentionMembers: [],
    };

    var openColcoorListsDrawer = function (tab) {
      void tab;
    };
    var refreshListsDrawerIfOpen = function () {};

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

    function closeInlineSideChatMentionPicker() {
      var el = document.getElementById("inlineSideChatMentionPicker");
      if (el) {
        el.hidden = true;
        el.replaceChildren();
      }
      inlineSideChatMentionLastMatches = [];
      inlineSideChatMentionSelIndex = 0;
    }

    function sideChatMentionChipTitleForHandle(hStr) {
      var mems = Array.isArray(state.sideChatMentionMembers) ? state.sideChatMentionMembers : [];
      var h = String(hStr || "").toLowerCase();
      if (h === "all") {
        return "Everyone in this conversation";
      }
      for (var i = 0; i < mems.length; i++) {
        var m = mems[i] || {};
        var mh = m.handle && String(m.handle).toLowerCase() === h;
        var dnorm = m.display_name
          ? String(m.display_name)
              .toLowerCase()
              .replace(/\\s+/g, "_")
              .replace(/[^a-z0-9_.-]/g, "")
          : "";
        var lp = m.email && String(m.email).indexOf("@") > 0 ? String(m.email).split("@")[0].toLowerCase() : "";
        if (mh || (dnorm && dnorm === h) || (lp && lp === h)) {
          var parts = [];
          if (m.display_name) parts.push(String(m.display_name));
          if (m.handle) parts.push("@" + String(m.handle));
          if (m.email) parts.push(String(m.email));
          return parts.join(" · ");
        }
      }
      return "";
    }

    function sideChatMentionActiveContext(ta) {
      if (!ta) return null;
      var v = String(ta.value || "");
      var caret = typeof ta.selectionStart === "number" ? ta.selectionStart : v.length;
      var before = v.slice(0, caret);
      var at = before.lastIndexOf("@");
      if (at < 0) return null;
      var tail = before.slice(at + 1);
      if (/[\\s\\n\\r]/.test(tail)) return null;
      return { start: at, end: caret, query: tail };
    }

    function sideChatMentionFilterMembers(query) {
      var q = String(query || "").toLowerCase();
      var mems = Array.isArray(state.sideChatMentionMembers) ? state.sideChatMentionMembers : [];
      var vid = state.viewerUserId && String(state.viewerUserId).trim();
      var out = [];
      var showAll = !q || "all".indexOf(q) === 0;
      if (showAll) {
        out.push({ __mentionAll: true });
      }
      for (var i = 0; i < mems.length; i++) {
        var m = mems[i] || {};
        if (vid && m.user_id && String(m.user_id).trim() === vid) continue;
        var keys = [];
        if (m.handle) keys.push(String(m.handle).toLowerCase());
        if (m.display_name) {
          keys.push(
            String(m.display_name)
              .toLowerCase()
              .replace(/\\s+/g, "_")
              .replace(/[^a-z0-9_.-]/g, "")
          );
        }
        if (m.email && String(m.email).indexOf("@") > 0) {
          keys.push(String(m.email).split("@")[0].toLowerCase());
        }
        var hit =
          !q ||
          keys.some(function (x) {
            return x && x.indexOf(q) === 0;
          });
        if (hit) out.push(m);
      }
      return out.slice(0, 12);
    }

    function highlightInlineSideChatMentionPicker() {
      var box = document.getElementById("inlineSideChatMentionPicker");
      if (!box || box.hidden) return;
      var btns = box.querySelectorAll("button.inline-sidechat-mention-item");
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("mention-item-active", i === inlineSideChatMentionSelIndex);
      }
    }

    function renderInlineSideChatMentionPicker(matches) {
      var box = document.getElementById("inlineSideChatMentionPicker");
      if (!box) return;
      box.replaceChildren();
      inlineSideChatMentionLastMatches = matches;
      inlineSideChatMentionSelIndex = Math.min(
        inlineSideChatMentionSelIndex,
        Math.max(0, matches.length - 1)
      );
      if (!matches.length) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      for (var j = 0; j < matches.length; j++) {
        var m = matches[j];
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "inline-sidechat-mention-item";
        btn.setAttribute("data-idx", String(j));
        if (m.__mentionAll) {
          btn.textContent = "All — @all (everyone)";
        } else {
          var primary =
            m.handle && String(m.handle).trim()
              ? "@" + String(m.handle).trim()
              : m.display_name && String(m.display_name).trim()
                ? String(m.display_name).trim()
                : m.email
                  ? String(m.email)
                  : String(m.user_id || "");
          var sub = [];
          if (m.display_name && (!m.handle || String(m.display_name).trim() !== primary))
            sub.push(String(m.display_name).trim());
          if (m.email) sub.push(String(m.email));
          btn.textContent = primary + (sub.length ? " — " + sub.join(" · ") : "");
        }
        box.appendChild(btn);
      }
      highlightInlineSideChatMentionPicker();
    }

    function applyInlineSideChatMentionPick(m) {
      var ta = document.getElementById("inlineSideChatInput");
      var ctx = sideChatMentionActiveContext(ta);
      if (!ta || !ctx || !m) return;
      var insert = "";
      if (m.__mentionAll) {
        insert = "@all";
      } else {
        insert =
          m.handle && String(m.handle).trim()
            ? "@" + String(m.handle).trim()
            : "@" +
              String(m.display_name || "")
                .trim()
                .toLowerCase()
                .replace(/\\s+/g, "_")
                .replace(/[^a-z0-9_.-]/g, "");
      }
      if (!insert || insert === "@") return;
      var v = String(ta.value || "");
      var next = v.slice(0, ctx.start) + insert + " " + v.slice(ctx.end);
      ta.value = next;
      var pos = ctx.start + insert.length + 1;
      try {
        ta.setSelectionRange(pos, pos);
      } catch (ePick) {}
      closeInlineSideChatMentionPicker();
      updateInlineSideChatSendEnabled();
    }

    function updateInlineSideChatMentionPicker() {
      var ta = document.getElementById("inlineSideChatInput");
      var ctx = sideChatMentionActiveContext(ta);
      if (!ctx) {
        closeInlineSideChatMentionPicker();
        return;
      }
      var matches = sideChatMentionFilterMembers(ctx.query);
      renderInlineSideChatMentionPicker(matches);
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

    function updateThreadVisitNav() {
      var back = document.getElementById("btnSelectionHistoryBack");
      var fwd = document.getElementById("btnSelectionHistoryForward");
      if (!back || !fwd) return;
      var canBack = state.selectionVisitCanGoBack === true;
      var canFwd = state.selectionVisitCanGoForward === true;
      back.disabled = state.busy || !canBack;
      fwd.disabled = state.busy || !canFwd;
    }

    function renderDetailBar() {
      const copyBtn = document.getElementById("btnCopy");
      const toggleStarBtn = document.getElementById("btnToggleStar");
      const copyThreadBtn = document.getElementById("btnCopyThread");
      const editTitleBtn = document.getElementById("btnEditMessageTitle");
      const refSideChatBtn = document.getElementById("btnReferenceSideChat");
      const refNoteSideChatBtn = document.getElementById("btnReferenceNoteSideChat");
      const addNoteBtn = document.getElementById("btnAddNote");
      const listNotesOnSelectionBtn = document.getElementById("btnListNotesOnSelection");
      const openSearchBtn = document.getElementById("btnOpenSearch");
      const starredDrawerBtn = document.getElementById("btnStarredDrawer");
      const todoDrawerBtn = document.getElementById("btnTodoDrawer");
      const starredTodoDrawerBtn = document.getElementById("btnStarredTodoDrawer");
      const openSideChatBtn = document.getElementById("btnOpenSideChat");
      const resendBtn = document.getElementById("btnResend");
      const deleteBranchBtn = document.getElementById("btnDeleteMessageBranch");
      if (
        !copyBtn ||
        !toggleStarBtn ||
        !resendBtn ||
        !refSideChatBtn ||
        !refNoteSideChatBtn ||
        !addNoteBtn ||
        !listNotesOnSelectionBtn
      )
        return;
      if (openSearchBtn) openSearchBtn.disabled = state.busy;
      if (starredDrawerBtn) starredDrawerBtn.disabled = state.busy;
      if (todoDrawerBtn) todoDrawerBtn.disabled = state.busy;
      if (starredTodoDrawerBtn) starredTodoDrawerBtn.disabled = state.busy;
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
        copyBtn.disabled = true;
        toggleStarBtn.disabled = true;
        refSideChatBtn.disabled = true;
        refNoteSideChatBtn.disabled = true;
        resendBtn.disabled = true;
        if (copyThreadBtn) copyThreadBtn.disabled = true;
        if (deleteBranchBtn) {
          deleteBranchBtn.disabled = true;
          deleteBranchBtn.title = "Select a message in the tree first.";
        }
        addNoteBtn.disabled = true;
        addNoteBtn.title = "Select a message in the tree first.";
        listNotesOnSelectionBtn.disabled = true;
        listNotesOnSelectionBtn.title = "Select a message in the tree first.";
        toggleStarBtn.textContent = "Star";
        toggleStarBtn.title = "Select a message in the tree to star or unstar.";
        if (editTitleBtn) {
          editTitleBtn.disabled = true;
          editTitleBtn.title = "Select a message in the tree first.";
        }
        const jumpBtnEmpty = document.getElementById("btnJumpTip");
        if (jumpBtnEmpty) jumpBtnEmpty.disabled = state.busy;
      } else {
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
      if (deleteBranchBtn) {
        const isRoot = last.parent_event_id == null;
        const viewer = state.sideChatViewerRole === "viewer";
        deleteBranchBtn.disabled = state.busy || isRoot || viewer;
        if (viewer) {
          deleteBranchBtn.title = "Viewers cannot delete a message branch.";
        } else if (isRoot) {
          deleteBranchBtn.title = "The conversation root cannot be deleted.";
        } else if (state.busy) {
          deleteBranchBtn.title = "Wait for the current operation to finish.";
        } else {
          deleteBranchBtn.title = "Delete the selected message and all replies under it (owner/editor).";
        }
      }
      if (editTitleBtn) {
        const canTitle =
          last.kind === "user_input" || last.kind === "assistant_output";
        editTitleBtn.disabled = state.busy || !canTitle;
        editTitleBtn.title = !canTitle
          ? "Titles apply only to user or assistant messages."
          : state.busy
            ? "Wait for the current operation to finish."
            : "Set or clear the display-only title for the selected message.";
      }
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
      function walk(parentKey, depth) {
        const d = typeof depth === "number" && depth >= 0 ? depth : 0;
        const kids = byParent.get(parentKey) || [];
        if (!kids.length) return "";
        const colorLevel = d % 6;
        let html = '<ul class="tree-nested tree-guide-l' + colorLevel + '">';
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
          const cpTree =
            e.checkpoint_label && String(e.checkpoint_label).trim()
              ? String(e.checkpoint_label).trim()
              : "";
          const msgTitleBlock = cpTree ? '<div class="node-msg-title">' + esc(cpTree) + "</div>" : "";
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
            msgTitleBlock +
            '<div class="node-snippet' +
            snipCls +
            '" dir="auto">' +
            esc(snip) +
            "</div></div></div></div>";
          if (hasKids && !collapsed) {
            html += walk(e.id, d + 1);
          }
          html += "</li>";
        }
        html += "</ul>";
        return html;
      }
      root.innerHTML = walk("__root__", 0);
    }

    function renderThread() {
      const el = document.getElementById("thread");
      if (!el) return;
      const segs = visibleThreadSegmentsForUi();
      if (!segs.length && !state.pendingUserHtml && !state.streamingHtml && !state.busy) {
        el.innerHTML = '<p class="empty">Select an event in the tree.</p>';
        scrollThreadToBottom();
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
            ? '<div class="thread-msg-title">' + esc("Title: " + String(s.checkpointLabel)) + "</div>"
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
      } else if (state.busy) {
        html +=
          '<div class="msg assistant assistant-waiting">' +
          '<div class="role">Assistant</div>' +
          '<p class="pending-hint">Preparing reply…</p>' +
          "</div>";
      }
      el.innerHTML = html || '<p class="empty">Nothing to show on this path.</p>';
      scrollThreadToBottom();
    }

    function inlineSideChatAuthorLabel(m) {
      var k = m && m.kind ? String(m.kind) : "user";
      if (k === "system_join") return "System · join";
      if (k === "system_leave") return "System · leave";
      if (k === "user") {
        var dn = m.author_display_name && String(m.author_display_name).trim();
        return dn ? dn : "Member";
      }
      return k;
    }

    /** Unread dot is for others’ messages only — own user rows are never unread for the viewer. */
    function inlineSideChatMessageUnreadForViewer(m, seqNum, lr) {
      if (m && m.deleted_at != null && String(m.deleted_at).trim() !== "") return false;
      if (!(typeof seqNum === "number" && seqNum > lr)) return false;
      var k = m && m.kind ? String(m.kind) : "user";
      if (k !== "user") return true;
      var vid =
        state.viewerUserId && String(state.viewerUserId).trim()
          ? String(state.viewerUserId).trim()
          : "";
      var aid =
        m.author_user_id && String(m.author_user_id).trim()
          ? String(m.author_user_id).trim()
          : "";
      if (vid && aid && aid === vid) return false;
      return true;
    }

    function inlineSideChatGetMenuOpts(m) {
      var role = state.sideChatViewerRole;
      var vid =
        state.viewerUserId && String(state.viewerUserId).trim()
          ? String(state.viewerUserId).trim()
          : "";
      var mk = m && m.kind ? String(m.kind) : "user";
      var aid =
        m.author_user_id && String(m.author_user_id).trim()
          ? String(m.author_user_id).trim()
          : "";
      var mid = m.id != null ? String(m.id) : "";
      var delAt = m.deleted_at != null ? String(m.deleted_at) : "";
      var canEdit = mk === "user" && !delAt && vid && aid && aid === vid;
      var canDel =
        !delAt &&
        (role === "owner" || (mk === "user" && vid && aid && aid === vid));
      var showReply = mk === "user" && !delAt && !!mid;
      return { showReply: showReply, canEdit: canEdit, canDel: canDel, mid: mid };
    }

    function inlineSideChatCloseMsgMenu() {
      var menu = document.getElementById("inlineSideChatMsgMenu");
      if (!menu) return;
      menu.hidden = true;
      menu.replaceChildren();
    }

    function inlineSideChatPositionMsgMenu(menu, left, top) {
      var pad = 6;
      var vw = window.innerWidth || 800;
      var vh = window.innerHeight || 600;
      menu.style.left = pad + "px";
      menu.style.top = pad + "px";
      var w = menu.offsetWidth || 160;
      var h = menu.offsetHeight || 40;
      var x = Math.max(pad, Math.min(left, vw - w - pad));
      var y = Math.max(pad, Math.min(top, vh - h - pad));
      menu.style.left = x + "px";
      menu.style.top = y + "px";
    }

    function inlineSideChatPopulateAndShowMenu(clientX, clientY, mid, o) {
      var menu = document.getElementById("inlineSideChatMsgMenu");
      if (!menu || !mid) return;
      menu.replaceChildren();
      if (o.showReply) {
        var br = document.createElement("button");
        br.type = "button";
        br.setAttribute("data-inline-sc-reply", "1");
        br.setAttribute("data-msg-id", mid);
        br.setAttribute("role", "menuitem");
        br.textContent = "Reply";
        menu.appendChild(br);
      }
      if (o.canEdit) {
        var be = document.createElement("button");
        be.type = "button";
        be.setAttribute("data-inline-sc-edit", "1");
        be.setAttribute("data-msg-id", mid);
        be.setAttribute("role", "menuitem");
        be.textContent = "Edit";
        menu.appendChild(be);
      }
      if (o.canDel) {
        var bd = document.createElement("button");
        bd.type = "button";
        bd.setAttribute("data-inline-sc-del", "1");
        bd.setAttribute("data-msg-id", mid);
        bd.setAttribute("role", "menuitem");
        bd.textContent = "Delete";
        menu.appendChild(bd);
      }
      menu.hidden = false;
      requestAnimationFrame(function () {
        inlineSideChatPositionMsgMenu(menu, clientX, clientY);
      });
    }

    function wireInlineSideChatMsgMenuOnce() {
      var menu = document.getElementById("inlineSideChatMsgMenu");
      if (!menu || menu.dataset.inlineScMenuWired === "1") return;
      menu.dataset.inlineScMenuWired = "1";
      menu.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var del = t.closest("[data-inline-sc-del]");
        if (del) {
          var did = del.getAttribute("data-msg-id");
          inlineSideChatCloseMsgMenu();
          if (did) vscode.postMessage({ type: "deleteSideChat", messageId: did });
          return;
        }
        var ed = t.closest("[data-inline-sc-edit]");
        if (ed) {
          var eid = ed.getAttribute("data-msg-id");
          var listEl = document.getElementById("inlineSideChatList");
          var row =
            listEl && eid ? listEl.querySelector('.inline-sidechat-msg[data-sidechat-id="' + eid + '"]') : null;
          inlineSideChatCloseMsgMenu();
          if (eid && row) inlineSideChatBeginEdit(row, eid);
          return;
        }
        var rp = t.closest("[data-inline-sc-reply]");
        if (rp) {
          var rid = rp.getAttribute("data-msg-id");
          inlineSideChatCloseMsgMenu();
          if (rid) {
            inlineSideChatReplyTargetId = rid;
            inlineSideChatUpdateReplyHint();
            var taSc = document.getElementById("inlineSideChatInput");
            scheduleComposerFocus(taSc);
          }
        }
      });
    }

    function wireInlineSideChatMenuDismissOnce() {
      if (document.documentElement.dataset.inlineScMenuDismissWired === "1") return;
      document.documentElement.dataset.inlineScMenuDismissWired = "1";
      document.addEventListener(
        "mousedown",
        function (ev) {
          var menu = document.getElementById("inlineSideChatMsgMenu");
          if (!menu || menu.hidden) return;
          var t = ev.target;
          if (t && menu.contains(t)) return;
          if (t && t.closest && t.closest("[data-inline-sc-menu-btn]")) return;
          inlineSideChatCloseMsgMenu();
        },
        true,
      );
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        inlineSideChatCloseMsgMenu();
      });
    }

    function inlineSideChatUpdateReplyHint() {
      var row = document.getElementById("inlineSideChatReplyRow");
      var hint = document.getElementById("inlineSideChatReplyHint");
      if (!row || !hint) return;
      if (!inlineSideChatReplyTargetId) {
        row.style.display = "none";
        hint.textContent = "";
        return;
      }
      row.style.display = "flex";
      hint.textContent = "Replying to a side-chat message — send includes that reference.";
    }

    function inlineSideChatEndEdit(rowEl, bodyHtml) {
      rowEl.dataset.editing = "0";
      var bodyEl = rowEl.querySelector(".body");
      if (!bodyEl) return;
      bodyEl.innerHTML = typeof bodyHtml === "string" ? bodyHtml : "";
    }

    function inlineSideChatBeginEdit(rowEl, messageId) {
      var rows = Array.isArray(state.sideChatMessages) ? state.sideChatMessages : [];
      var m = rows.find(function (x) {
        return x && String(x.id) === String(messageId);
      });
      if (!m || rowEl.dataset.editing === "1") return;
      rowEl.dataset.editing = "1";
      var bodyEl = rowEl.querySelector(".body");
      if (!bodyEl) return;
      var origHtml =
        typeof m.rendered_body_html === "string" && m.rendered_body_html.length
          ? m.rendered_body_html
          : esc(String(m.body || ""));
      var origText = m.body != null ? String(m.body) : "";
      var wrap = document.createElement("div");
      var ta = document.createElement("textarea");
      ta.className = "edit-ta";
      ta.setAttribute("dir", "auto");
      ta.value = origText;
      var rb = document.createElement("div");
      rb.className = "row";
      var save = document.createElement("button");
      save.type = "button";
      save.textContent = "Save";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn-secondary";
      cancel.textContent = "Cancel";
      save.addEventListener("click", function () {
        vscode.postMessage({ type: "editSideChat", messageId: messageId, text: ta.value });
      });
      cancel.addEventListener("click", function () {
        inlineSideChatEndEdit(rowEl, origHtml);
      });
      rb.appendChild(save);
      rb.appendChild(cancel);
      wrap.appendChild(ta);
      wrap.appendChild(rb);
      bodyEl.replaceChildren();
      bodyEl.appendChild(wrap);
    }

    function wireInlineSideChatListActions() {
      var list = document.getElementById("inlineSideChatList");
      if (!list || list.dataset.inlineScWired === "1") return;
      list.dataset.inlineScWired = "1";
      wireInlineSideChatMsgMenuOnce();
      wireInlineSideChatMenuDismissOnce();
      list.addEventListener("scroll", function () {
        inlineSideChatCloseMsgMenu();
      });
      list.addEventListener(
        "contextmenu",
        function (ev) {
          var row = ev.target.closest(".inline-sidechat-msg");
          if (!row) return;
          if (row.dataset.editing === "1") return;
          var mid = row.getAttribute("data-sidechat-id");
          if (!mid) return;
          var rows = Array.isArray(state.sideChatMessages) ? state.sideChatMessages : [];
          var m = rows.find(function (x) {
            return x && String(x.id) === String(mid);
          });
          if (!m) return;
          var o = inlineSideChatGetMenuOpts(m);
          if (!o.showReply && !o.canEdit && !o.canDel) return;
          ev.preventDefault();
          ev.stopPropagation();
          inlineSideChatPopulateAndShowMenu(ev.clientX, ev.clientY, mid, o);
        },
        true,
      );
      list.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var mb = t.closest("[data-inline-sc-menu-btn]");
        if (mb) {
          ev.preventDefault();
          ev.stopPropagation();
          var mid = mb.getAttribute("data-msg-id");
          if (!mid) return;
          var rows = Array.isArray(state.sideChatMessages) ? state.sideChatMessages : [];
          var m = rows.find(function (x) {
            return x && String(x.id) === String(mid);
          });
          if (!m) return;
          var o = inlineSideChatGetMenuOpts(m);
          if (!o.showReply && !o.canEdit && !o.canDel) return;
          var rect = mb.getBoundingClientRect();
          inlineSideChatPopulateAndShowMenu(rect.left, rect.bottom + 2, mid, o);
        }
      });
    }

    function renderInlineSideChat() {
      var col = document.getElementById("colSideChat");
      var wrap = document.getElementById("inlineSideChat");
      var list = document.getElementById("inlineSideChatList");
      if (!col || !wrap || !list) return;
      if (!state.sideChatVisible) {
        col.style.display = "none";
        col.setAttribute("aria-hidden", "true");
        closeInlineSideChatMentionPicker();
        inlineSideChatCloseMsgMenu();
        list.textContent = "";
        pendingInlineSideChatScrollAfterSend = false;
        if (inlineSideChatScrollAfterSendTimer) {
          clearTimeout(inlineSideChatScrollAfterSendTimer);
          inlineSideChatScrollAfterSendTimer = null;
        }
        if (sideChatResizeObserver) {
          sideChatResizeObserver.disconnect();
          sideChatResizeObserver = null;
        }
        return;
      }
      col.style.display = "flex";
      col.setAttribute("aria-hidden", "false");
      wireInlineSideChatListActions();
      inlineSideChatCloseMsgMenu();
      var rows = Array.isArray(state.sideChatMessages) ? state.sideChatMessages : [];
      if (!rows.length) {
        list.innerHTML = '<p class="empty">No side-chat messages yet.</p>';
        maybeScrollInlineSideChatAfterLocalSend();
        inlineSideChatUpdateReplyHint();
        return;
      }
      var lrRaw = state.sideChatLastReadSeq;
      var lr =
        typeof lrRaw === "number" && Number.isFinite(lrRaw) ? Math.max(0, Math.floor(lrRaw)) : 0;
      var html = "";
      for (var i = 0; i < rows.length; i++) {
        var m = rows[i] || {};
        var bodyHtml =
          typeof m.rendered_body_html === "string" && m.rendered_body_html.length
            ? m.rendered_body_html
            : esc(String(m.body || ""));
        var seqNum = typeof m.seq === "number" && Number.isFinite(m.seq) ? m.seq : i + 1;
        var unread = inlineSideChatMessageUnreadForViewer(m, seqNum, lr);
        var vid =
          state.viewerUserId && String(state.viewerUserId).trim()
            ? String(state.viewerUserId).trim()
            : "";
        var mk = m && m.kind ? String(m.kind) : "user";
        var aid =
          m.author_user_id && String(m.author_user_id).trim()
            ? String(m.author_user_id).trim()
            : "";
        var ownSc = mk === "user" && vid && aid && aid === vid;
        var mid = m.id != null ? String(m.id) : "";
        var menuOpts = inlineSideChatGetMenuOpts(m);
        var hasMsgMenu = menuOpts.showReply || menuOpts.canEdit || menuOpts.canDel;
        var mentionsHtml = "";
        if (Array.isArray(m.mentions) && m.mentions.length) {
          mentionsHtml =
            '<span class="inline-sidechat-mentions">' +
            m.mentions
              .map(function (h) {
                var ht = sideChatMentionChipTitleForHandle(h);
                return (
                  '<span class="mention-chip"' +
                  (ht ? ' title="' + esc(ht) + '"' : "") +
                  ">@" +
                  esc(String(h)) +
                  "</span>"
                );
              })
              .join("") +
            "</span>";
        }
        var refsHtml = "";
        if (Array.isArray(m.reference_chips) && m.reference_chips.length) {
          refsHtml =
            '<span class="inline-sidechat-refs">' +
            m.reference_chips
              .map(function (r) {
                return '<span class="ref-chip">' + esc(String(r)) + "</span>";
              })
              .join("") +
            "</span>";
        }
        var refPreview = "";
        if (m.referenced_side_chat_preview && typeof m.referenced_side_chat_preview.seq === "number") {
          refPreview =
            '<div class="hint" style="margin:4px 0 0 0">↪ ' +
            esc(String(m.referenced_side_chat_preview.text || "(empty)")) +
            "</div>";
        }
        var menuBtn = "";
        if (hasMsgMenu && mid) {
          menuBtn =
            '<button type="button" class="inline-sidechat-msg-menu-btn" data-inline-sc-menu-btn="1" data-msg-id="' +
            esc(mid) +
            '" aria-haspopup="menu" aria-label="Side-chat message actions" title="Message actions (right-click message for same menu)">⋯</button>';
        }
        html +=
          '<div class="inline-sidechat-msg ' +
          (ownSc ? "inline-sidechat-msg-self" : "inline-sidechat-msg-peer") +
          (unread ? " inline-sidechat-msg-unread" : "") +
          '" data-sidechat-id="' +
          esc(mid) +
          '" data-sidechat-seq="' +
          esc(String(seqNum)) +
          '" data-editing="0" tabindex="-1" title="Right-click for Reply, Edit, or Delete when available">' +
          '<div class="inline-sidechat-meta-row">' +
          '<div class="inline-sidechat-meta-main">' +
          esc(inlineSideChatAuthorLabel(m)) +
          (unread
            ? '<span class="inline-sidechat-unread" title="Unread">●</span>'
            : "") +
          mentionsHtml +
          refsHtml +
          "</div>" +
          menuBtn +
          "</div>" +
          refPreview +
          '<div class="body md" dir="auto">' +
          bodyHtml +
          "</div>" +
          "</div>";
      }
      list.innerHTML = html;
      maybeScrollInlineSideChatAfterLocalSend();
      inlineSideChatUpdateReplyHint();
    }

    function scrollInlineSideChatToSeq(seq) {
      var n = typeof seq === "number" && Number.isFinite(seq) ? Math.floor(seq) : 0;
      if (n <= 0) return;
      var list = document.getElementById("inlineSideChatList");
      if (!list) return;
      var row = list.querySelector('[data-sidechat-seq="' + String(n) + '"]');
      if (row && row.scrollIntoView) {
        try {
          row.scrollIntoView({ block: "nearest" });
        } catch (e1) {
          row.scrollIntoView();
        }
      }
    }

    function updateComposerSendEnabled() {
      var sendBtn = document.getElementById("send");
      var ta = document.getElementById("input");
      var qBtn = document.getElementById("btnQueueAfterReply");
      var bBtn = document.getElementById("btnNewBranchWhileBusy");
      if (!sendBtn) {
        return;
      }
      var hasText = ta && String(ta.value || "").trim().length > 0;
      var has = hasText || pendingSendImages.length > 0;
      var wf = state.waitingForAssistant === true;
      if (state.busy && wf) {
        sendBtn.disabled = true;
        if (qBtn) {
          qBtn.disabled = !has;
          qBtn.title = has
            ? "Queue this message: it will be sent as the next user line under the assistant reply that is generating."
            : "Type a message or paste an image first.";
        }
        if (bBtn) {
          bBtn.disabled = !has;
          bBtn.title = has
            ? "Send as a sibling branch from the message you replied to. Uses “Private (draft)” below — shared when unchecked, private when checked."
            : "Type a message or paste an image first.";
        }
        return;
      }
      if (state.busy) {
        sendBtn.disabled = true;
        if (qBtn) qBtn.disabled = true;
        if (bBtn) bBtn.disabled = true;
        return;
      }
      sendBtn.disabled = !has;
      sendBtn.title = has
        ? ""
        : "Type a message or paste an image. Shift+Enter for newline, Enter to send.";
      if (qBtn) qBtn.disabled = true;
      if (bBtn) bBtn.disabled = true;
    }

    function updateInlineSideChatSendEnabled() {
      var sendBtn = document.getElementById("btnInlineSideChatSend");
      var ta = document.getElementById("inlineSideChatInput");
      if (!sendBtn) return;
      var hasText = ta && String(ta.value || "").trim().length > 0;
      var has = hasText || pendingInlineSideChatImages.length > 0;
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

    /** Scroll the thread panel so the latest messages are visible (root → selected reads bottom-up). */
    function scrollThreadToBottom() {
      var threadEl = document.getElementById("thread");
      if (!threadEl) return;
      var wrap = threadEl.closest(".thread-scroll");
      if (!wrap) return;
      var run = function () {
        try {
          wrap.scrollTop = wrap.scrollHeight;
        } catch (e) {}
      };
      try {
        requestAnimationFrame(run);
      } catch (e) {
        setTimeout(run, 0);
      }
    }

    function scrollInlineSideChatListToBottom() {
      var list = document.getElementById("inlineSideChatList");
      if (!list) return;
      var run = function () {
        try {
          list.scrollTop = list.scrollHeight;
        } catch (e) {}
      };
      try {
        requestAnimationFrame(run);
      } catch (e) {
        setTimeout(run, 0);
      }
    }

    /**
     * On open: scroll so the first unread row is at the top of the list (unread = contiguous tail by seq).
     * With zero unread count, scroll to the latest message.
     */
    function scrollInlineSideChatToFirstUnread() {
      var list = document.getElementById("inlineSideChatList");
      if (!list) return;
      var rows = list.querySelectorAll(".inline-sidechat-msg");
      var n = rows.length;
      if (!n) return;
      var uRaw = state.sideChatUnreadCount;
      var u =
        typeof uRaw === "number" && Number.isFinite(uRaw) && uRaw > 0
          ? Math.min(Math.floor(uRaw), n)
          : 0;
      var idx = u > 0 ? n - u : n - 1;
      var target = rows[idx];
      if (!target) return;
      var run = function () {
        try {
          list.scrollTop = Math.max(0, target.offsetTop - 6);
        } catch (e) {}
      };
      try {
        requestAnimationFrame(run);
      } catch (e) {
        setTimeout(run, 0);
      }
    }

    function markInlineSideChatScrollAfterLocalSend() {
      pendingInlineSideChatScrollAfterSend = true;
      inlineSideChatRowCountWhenSent = Array.isArray(state.sideChatMessages) ? state.sideChatMessages.length : 0;
      if (inlineSideChatScrollAfterSendTimer) {
        clearTimeout(inlineSideChatScrollAfterSendTimer);
        inlineSideChatScrollAfterSendTimer = null;
      }
      inlineSideChatScrollAfterSendTimer = setTimeout(function () {
        pendingInlineSideChatScrollAfterSend = false;
        inlineSideChatScrollAfterSendTimer = null;
      }, 8000);
    }

    function maybeScrollInlineSideChatAfterLocalSend() {
      if (!pendingInlineSideChatScrollAfterSend || !state.sideChatVisible) return;
      scrollInlineSideChatListToBottom();
      var n = Array.isArray(state.sideChatMessages) ? state.sideChatMessages.length : 0;
      if (n > inlineSideChatRowCountWhenSent) {
        pendingInlineSideChatScrollAfterSend = false;
        if (inlineSideChatScrollAfterSendTimer) {
          clearTimeout(inlineSideChatScrollAfterSendTimer);
          inlineSideChatScrollAfterSendTimer = null;
        }
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
        const loadEl = document.getElementById("conversationLoading");
        const sendBtn = document.getElementById("send");
        const stopBtn = document.getElementById("stop");
        const refBtn = document.getElementById("refresh");
        const ta = document.getElementById("input");
        const priv = document.getElementById("privateBranch");
        const busyEl = document.getElementById("busy");
        const errText = state.lastError != null && String(state.lastError).trim();
        if (loadEl) {
          if (state.conversationLoading === true) {
            loadEl.style.display = "flex";
            loadEl.setAttribute("aria-busy", "true");
          } else {
            loadEl.style.display = "none";
            loadEl.setAttribute("aria-busy", "false");
          }
        }
        if (errText && errEl) {
          errEl.style.display = "block";
          errEl.textContent = errText;
        } else if (errEl) {
          errEl.style.display = "none";
          errEl.textContent = "";
        }
        updateLegalPolicyStrip();
        var wf = state.waitingForAssistant === true;
        var waitRow = document.getElementById("composerWhileWaitingRow");
        if (waitRow) {
          waitRow.style.display = state.busy && wf ? "flex" : "none";
        }
        if (sendBtn) {
          sendBtn.textContent = state.busy && !wf ? "Sending…" : "Send";
          if (state.busy && wf) {
            sendBtn.style.display = "none";
            updateComposerSendEnabled();
          } else {
            sendBtn.style.display = "";
            if (state.busy) {
              sendBtn.disabled = true;
              sendBtn.title = "Your message is being sent…";
            } else {
              updateComposerSendEnabled();
            }
          }
        }
        updateInlineSideChatSendEnabled();
        if (stopBtn) {
          stopBtn.disabled = !state.busy;
          stopBtn.title = state.busy ? "Cancel the in-progress assistant reply." : "";
        }
        if (refBtn) refBtn.disabled = state.busy;
        if (ta) ta.disabled = state.busy && !wf;
        if (priv) priv.disabled = state.busy && !wf;
        if (busyEl) {
          busyEl.style.display = state.busy ? "inline" : "none";
          busyEl.textContent =
            state.busy && wf
              ? "Assistant is replying… You can queue a follow-up or start a branch (see Private draft below)."
              : state.busy
                ? "Sending… Press Stop to cancel."
                : "Working…";
        }
        var badge = document.getElementById("queuedSendBadge");
        if (badge) {
          var n =
            typeof state.queuedMainSendCount === "number" && Number.isFinite(state.queuedMainSendCount)
              ? Math.max(0, Math.floor(state.queuedMainSendCount))
              : 0;
          if (n > 0) {
            badge.style.display = "inline";
            badge.textContent = n === 1 ? "1 message queued." : String(n) + " messages queued.";
          } else {
            badge.style.display = "none";
            badge.textContent = "";
          }
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
        var cidScroll = typeof state.conversationId === "string" ? state.conversationId : "";
        if (cidScroll !== prevConversationIdForSideChatScroll) {
          prevConversationIdForSideChatScroll = cidScroll;
          prevSideChatPanelOpen = false;
        }
        renderTree();
        renderThread();
        renderInlineSideChat();
        renderDetailBar();
        updateThreadVisitNav();
        applyTreeWidth();
        applySideChatColumnWidth();
        wireTreeResize();
        wireSideChatResize();
        wireComposerResize();
        var nowSideOpen = !!state.sideChatVisible;
        if (!prevSideChatPanelOpen && nowSideOpen) {
          scrollInlineSideChatToFirstUnread();
        }
        prevSideChatPanelOpen = nowSideOpen;
        try {
          refreshListsDrawerIfOpen();
        } catch (eR) {}
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

    (function wireSearchDrawer() {
      var backdrop = document.getElementById("searchDrawerBackdrop");
      var drawer = document.getElementById("searchDrawer");
      var closeBtn = document.getElementById("searchDrawerClose");
      var queryEl = document.getElementById("searchDrawerQuery");
      var listEl = document.getElementById("searchDrawerResultsList");
      var scopeConv = document.getElementById("searchScopeConv");
      var scopeTitles = document.getElementById("searchScopeTitles");
      var scopeNotes = document.getElementById("searchScopeNotes");
      var scopeSc = document.getElementById("searchScopeSidechat");
      var openBtn = document.getElementById("btnOpenSearch");
      if (
        !backdrop ||
        !drawer ||
        !closeBtn ||
        !queryEl ||
        !listEl ||
        !scopeConv ||
        !scopeTitles ||
        !scopeNotes ||
        !scopeSc
      ) {
        return;
      }
      var LS_CONV = "colcoor.search.scope.conversation";
      var LS_TITLES = "colcoor.search.scope.titles";
      var LS_NOTES = "colcoor.search.scope.notes";
      var LS_SC = "colcoor.search.scope.sidechat";
      var searchOpen = false;
      var searchTimer = null;
      var maxHits = 80;

      function readBool(lsKey, defVal) {
        try {
          var v = localStorage.getItem(lsKey);
          if (v === null) return defVal;
          return v === "1" || v === "true";
        } catch (e0) {
          return defVal;
        }
      }
      function writeBool(lsKey, b) {
        try {
          localStorage.setItem(lsKey, b ? "1" : "0");
        } catch (e1) {}
      }
      function loadScopes() {
        scopeConv.checked = readBool(LS_CONV, true);
        scopeTitles.checked = readBool(LS_TITLES, true);
        scopeNotes.checked = readBool(LS_NOTES, true);
        scopeSc.checked = readBool(LS_SC, true);
      }
      function stripHtml(s) {
        return String(s || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\\s+/g, " ")
          .trim();
      }
      function openSearch() {
        try {
          document.dispatchEvent(new Event("colcoor-close-lists-drawer"));
        } catch (eL) {}
        searchOpen = true;
        backdrop.classList.add("open");
        drawer.classList.add("open");
        backdrop.setAttribute("aria-hidden", "false");
        drawer.setAttribute("aria-hidden", "false");
        closeAllMenus();
        loadScopes();
        scheduleSearch();
        setTimeout(function () {
          try {
            queryEl.focus();
            queryEl.select();
          } catch (e2) {}
        }, 0);
      }
      function closeSearch() {
        searchOpen = false;
        backdrop.classList.remove("open");
        drawer.classList.remove("open");
        backdrop.setAttribute("aria-hidden", "true");
        drawer.setAttribute("aria-hidden", "true");
        listEl.replaceChildren();
      }
      function appendHint(text) {
        var li = document.createElement("li");
        li.className = "empty";
        li.textContent = text;
        listEl.appendChild(li);
      }
      function appendHit(kindLabel, title, snippet, attrs) {
        var li = document.createElement("li");
        li.setAttribute("role", "button");
        li.setAttribute("tabindex", "0");
        for (var ak in attrs) {
          if (Object.prototype.hasOwnProperty.call(attrs, ak)) {
            li.setAttribute(ak, attrs[ak]);
          }
        }
        li.innerHTML =
          '<div class="hit-kind">' +
          esc(kindLabel) +
          "</div>" +
          '<div class="hit-title">' +
          esc(title) +
          "</div>" +
          '<div class="hit-snippet">' +
          esc(snippet) +
          "</div>";
        listEl.appendChild(li);
      }
      function runSearch() {
        listEl.replaceChildren();
        var raw = String(queryEl.value || "").trim();
        if (!raw) {
          appendHint("Type to search, or adjust scopes above.");
          return;
        }
        var q = raw.toLowerCase();
        var count = 0;
        var anyScope =
          (scopeConv.checked ? 1 : 0) +
          (scopeTitles.checked ? 1 : 0) +
          (scopeNotes.checked ? 1 : 0) +
          (scopeSc.checked ? 1 : 0);
        if (!anyScope) {
          appendHint("Enable at least one search scope.");
          return;
        }
        if (scopeConv.checked) {
          var evs = state.events || [];
          for (var i = 0; i < evs.length && count < maxHits; i++) {
            var ev = evs[i] || {};
            var eid = ev.id && String(ev.id).trim();
            if (!eid) continue;
            var dispTitle = eventDisplayTitle(ev);
            var ct = (ev.content_text && String(ev.content_text)) || "";
            var hay = (dispTitle + " " + ct).toLowerCase();
            if (hay.indexOf(q) === -1) continue;
            var sn = snippet(ev);
            var cpHit =
              ev.checkpoint_label && String(ev.checkpoint_label).trim()
                ? String(ev.checkpoint_label).trim()
                : "";
            var hitTitle = dispTitle || cpHit || treeKindLabel(ev.kind) + " · " + sn;
            appendHit("Conversation", hitTitle, sn, {
              "data-hit-kind": "tree",
              "data-event-id": eid,
            });
            count++;
          }
        }
        if (scopeTitles.checked) {
          var evsT = state.events || [];
          for (var it = 0; it < evsT.length && count < maxHits; it++) {
            var evT = evsT[it] || {};
            var eidT = evT.id && String(evT.id).trim();
            if (!eidT) continue;
            var cpT =
              evT.checkpoint_label && String(evT.checkpoint_label).trim()
                ? String(evT.checkpoint_label).trim()
                : "";
            if (!cpT || cpT.toLowerCase().indexOf(q) === -1) continue;
            var snT = snippet(evT);
            appendHit("Title", cpT, snT, {
              "data-hit-kind": "tree",
              "data-event-id": eidT,
            });
            count++;
          }
        }
        if (scopeNotes.checked) {
          var notes = state.conversationNotes || [];
          for (var j = 0; j < notes.length && count < maxHits; j++) {
            var n = notes[j] || {};
            var nid = n.id && String(n.id).trim();
            var neid = n.event_id && String(n.event_id).trim();
            if (!nid || !neid) continue;
            var nc = (n.content && String(n.content)) || "";
            if (nc.toLowerCase().indexOf(q) === -1) continue;
            var nSnippet = nc.length > 120 ? nc.slice(0, 120) + "…" : nc;
            appendHit("Note", "Note on message " + neid.slice(0, 8) + "…", nSnippet, {
              "data-hit-kind": "note",
              "data-event-id": neid,
              "data-note-id": nid,
            });
            count++;
          }
        }
        if (scopeSc.checked) {
          var rows = state.sideChatMessages || [];
          for (var k = 0; k < rows.length && count < maxHits; k++) {
            var m = rows[k] || {};
            var seqNum = typeof m.seq === "number" && Number.isFinite(m.seq) ? m.seq : k + 1;
            var bodyPlain = (m.body && String(m.body)) || "";
            var rend = typeof m.rendered_body_html === "string" ? m.rendered_body_html : "";
            var author = (m.author_display_name && String(m.author_display_name).trim()) || "";
            var haySc = (bodyPlain + " " + stripHtml(rend) + " " + author).toLowerCase();
            if (haySc.indexOf(q) === -1) continue;
            var snSc = bodyPlain.trim() ? bodyPlain.trim().replace(/\\s+/g, " ") : stripHtml(rend);
            if (snSc.length > 120) snSc = snSc.slice(0, 120) + "…";
            appendHit("Side chat", author || inlineSideChatAuthorLabel(m), snSc, {
              "data-hit-kind": "sidechat",
              "data-seq": String(seqNum),
            });
            count++;
          }
        }
        if (!count) {
          appendHint("No matches.");
        }
      }
      function scheduleSearch() {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          searchTimer = null;
          runSearch();
        }, 120);
      }
      loadScopes();
      scopeConv.addEventListener("change", function () {
        writeBool(LS_CONV, scopeConv.checked);
        scheduleSearch();
      });
      scopeTitles.addEventListener("change", function () {
        writeBool(LS_TITLES, scopeTitles.checked);
        scheduleSearch();
      });
      scopeNotes.addEventListener("change", function () {
        writeBool(LS_NOTES, scopeNotes.checked);
        scheduleSearch();
      });
      scopeSc.addEventListener("change", function () {
        writeBool(LS_SC, scopeSc.checked);
        scheduleSearch();
      });
      queryEl.addEventListener("input", scheduleSearch);
      closeBtn.addEventListener("click", function () {
        closeSearch();
      });
      backdrop.addEventListener("click", function () {
        closeSearch();
      });
      document.addEventListener(
        "keydown",
        function (ev) {
          if (!searchOpen) return;
          if (ev.key === "Escape") {
            ev.preventDefault();
            closeSearch();
          }
        },
        true,
      );
      document.addEventListener(
        "keydown",
        function (ev) {
          if (searchOpen) return;
          if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
          if (ev.key !== "-" && ev.code !== "Minus") return;
          var t = ev.target;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
          ev.preventDefault();
          openSearch();
        },
        true,
      );
      listEl.addEventListener("click", function (ev) {
        var li = ev.target.closest && ev.target.closest("li[data-hit-kind]");
        if (!li) return;
        var hk = li.getAttribute("data-hit-kind");
        if (hk === "tree") {
          var tid = li.getAttribute("data-event-id");
          if (tid) vscode.postMessage({ type: "searchHit", target: { kind: "tree", eventId: tid } });
        } else if (hk === "note") {
          var ne = li.getAttribute("data-event-id");
          var nn = li.getAttribute("data-note-id");
          if (ne && nn) {
            vscode.postMessage({ type: "searchHit", target: { kind: "note", eventId: ne, noteId: nn } });
          }
        } else if (hk === "sidechat") {
          var sq = parseInt(li.getAttribute("data-seq"), 10);
          if (sq > 0) {
            vscode.postMessage({ type: "searchHit", target: { kind: "sidechat", seq: sq } });
          }
        }
        closeSearch();
      });
      if (openBtn) {
        openBtn.addEventListener("click", function () {
          openSearch();
        });
      }
      document.addEventListener(
        "colcoor-close-search-drawer",
        function () {
          if (searchOpen) closeSearch();
        },
        false,
      );
    })();

    (function wireListsDrawer() {
      var backdrop = document.getElementById("listsDrawerBackdrop");
      var drawer = document.getElementById("listsDrawer");
      var closeBtn = document.getElementById("listsDrawerClose");
      var tabStarred = document.getElementById("listsTabStarred");
      var tabTodo = document.getElementById("listsTabTodo");
      var btnRefresh = document.getElementById("listsDrawerRefresh");
      var ulStarred = document.getElementById("listsDrawerStarredList");
      var ulTodo = document.getElementById("listsDrawerTodoList");
      if (!backdrop || !drawer || !closeBtn || !tabStarred || !tabTodo || !ulStarred || !ulTodo) {
        return;
      }
      var LS_TAB = "colcoor.listsDrawer.tab";
      var listsOpen = false;
      var listsTab = "starred";

      function showListsTab(which) {
        listsTab = which === "todo" ? "todo" : "starred";
        try {
          localStorage.setItem(LS_TAB, listsTab);
        } catch (e0) {}
        tabStarred.setAttribute("aria-selected", listsTab === "starred" ? "true" : "false");
        tabTodo.setAttribute("aria-selected", listsTab === "todo" ? "true" : "false");
        ulStarred.style.display = listsTab === "starred" ? "block" : "none";
        ulTodo.style.display = listsTab === "todo" ? "block" : "none";
      }

      function renderListsRows() {
        ulStarred.replaceChildren();
        ulTodo.replaceChildren();
        var star = state.drawersStarred || [];
        var todos = state.drawersTodos || [];
        function fill(ul, rows, emptyHint) {
          if (!rows.length) {
            var li0 = document.createElement("li");
            li0.className = "empty";
            li0.textContent = emptyHint;
            ul.appendChild(li0);
            return;
          }
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i] || {};
            var eid = r.eventId != null ? String(r.eventId).trim() : "";
            if (!eid) continue;
            var lab = r.label != null ? String(r.label) : "";
            var li = document.createElement("li");
            li.setAttribute("role", "button");
            li.setAttribute("tabindex", "0");
            li.setAttribute("data-event-id", eid);
            li.innerHTML = '<div class="hit-title">' + esc(lab) + "</div>";
            ul.appendChild(li);
          }
        }
        fill(ulStarred, star, "(no starred messages)");
        fill(ulTodo, todos, "(no TODO notes)");
      }

      function closeLists() {
        listsOpen = false;
        backdrop.classList.remove("open");
        drawer.classList.remove("open");
        backdrop.setAttribute("aria-hidden", "true");
        drawer.setAttribute("aria-hidden", "true");
      }

      function openLists(tab) {
        try {
          document.dispatchEvent(new Event("colcoor-close-search-drawer"));
        } catch (eS) {}
        listsOpen = true;
        backdrop.classList.add("open");
        drawer.classList.add("open");
        backdrop.setAttribute("aria-hidden", "false");
        drawer.setAttribute("aria-hidden", "false");
        closeAllMenus();
        showListsTab(tab === "todo" ? "todo" : "starred");
        renderListsRows();
      }

      openColcoorListsDrawer = function (t) {
        openLists(t);
      };
      refreshListsDrawerIfOpen = function () {
        if (!listsOpen) return;
        renderListsRows();
      };

      document.addEventListener(
        "colcoor-close-lists-drawer",
        function () {
          if (listsOpen) closeLists();
        },
        false,
      );

      closeBtn.addEventListener("click", closeLists);
      backdrop.addEventListener("click", closeLists);
      tabStarred.addEventListener("click", function () {
        if (!listsOpen) return;
        showListsTab("starred");
      });
      tabTodo.addEventListener("click", function () {
        if (!listsOpen) return;
        showListsTab("todo");
      });
      if (btnRefresh) {
        btnRefresh.addEventListener("click", function () {
          vscode.postMessage({ type: "refresh" });
        });
      }

      function onListClick(ev) {
        var li = ev.target.closest && ev.target.closest("li[data-event-id]");
        if (!li || li.classList.contains("empty")) return;
        var eid = li.getAttribute("data-event-id");
        if (!eid) return;
        closeLists();
        vscode.postMessage({ type: "searchHit", target: { kind: "tree", eventId: eid } });
      }
      ulStarred.addEventListener("click", onListClick);
      ulTodo.addEventListener("click", onListClick);

      document.addEventListener(
        "keydown",
        function (ev) {
          if (!listsOpen) return;
          if (ev.key === "Escape") {
            ev.preventDefault();
            closeLists();
          }
        },
        true,
      );
    })();

    window.addEventListener("message", (event) => {
      const m = event.data;
      if (m && m.type === "playSound" && (m.kind === "message" || m.kind === "mention")) {
        playInlineSideChatSound(m.kind);
        return;
      }
      if (m && m.type === "focusSideChatSeq") {
        var fs = typeof m.seq === "number" && Number.isFinite(m.seq) ? Math.floor(m.seq) : 0;
        if (fs > 0) {
          setTimeout(function () {
            scrollInlineSideChatToSeq(fs);
          }, 0);
        }
        return;
      }
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
          conversationNotes: Array.isArray(m.conversationNotes) ? m.conversationNotes : [],
          drawersStarred: Array.isArray(m.drawersStarred) ? m.drawersStarred : [],
          drawersTodos: Array.isArray(m.drawersTodos) ? m.drawersTodos : [],
          legalPolicyLinks: Array.isArray(m.legalPolicyLinks) ? m.legalPolicyLinks : [],
          sideChatUnreadCount:
            typeof m.sideChatUnreadCount === "number" && Number.isFinite(m.sideChatUnreadCount)
              ? Math.max(0, Math.floor(m.sideChatUnreadCount))
              : 0,
          sideChatLastReadSeq:
            typeof m.sideChatLastReadSeq === "number" && Number.isFinite(m.sideChatLastReadSeq)
              ? Math.max(0, Math.floor(m.sideChatLastReadSeq))
              : 0,
          viewerUserId:
            typeof m.viewerUserId === "string" && m.viewerUserId.trim() ? m.viewerUserId.trim() : null,
          sideChatViewerRole:
            m.sideChatViewerRole === "owner" ||
            m.sideChatViewerRole === "editor" ||
            m.sideChatViewerRole === "viewer"
              ? m.sideChatViewerRole
              : null,
          waitingForAssistant: m.waitingForAssistant === true,
          queuedMainSendCount:
            typeof m.queuedMainSendCount === "number" && Number.isFinite(m.queuedMainSendCount)
              ? Math.max(0, Math.floor(m.queuedMainSendCount))
              : 0,
          conversationLoading: m.conversationLoading === true,
          sideChatMentionMembers: Array.isArray(m.sideChatMentionMembers) ? m.sideChatMentionMembers : [],
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

    function emitMainComposerSend(busySendMode) {
      const ta = document.getElementById("input");
      if (!ta) return;
      const text = ta.value ? ta.value.trim() : "";
      const imgs = pendingSendImages.slice();
      if (!text && !imgs.length) return;
      var privEl = document.getElementById("privateBranch");
      var payload = { type: "send", text: ta.value.trimEnd(), privateBranch: false };
      if (busySendMode === "queue") {
        payload.busySendMode = "queue";
        payload.privateBranch = false;
      } else if (busySendMode === "branch") {
        payload.busySendMode = "branch";
        payload.privateBranch = !!(privEl && privEl.checked);
      } else {
        payload.privateBranch = !!(privEl && privEl.checked);
      }
      if (imgs.length) payload.images = imgs;
      vscode.postMessage(payload);
      ta.value = "";
      pendingSendImages = [];
      renderPendingConversationImages();
      updateComposerSendEnabled();
      scheduleComposerFocus(ta);
    }

    document.getElementById("send").addEventListener("click", () => {
      emitMainComposerSend(undefined);
    });

    (function wireComposerWhileWaitingButtons() {
      var q = document.getElementById("btnQueueAfterReply");
      var b = document.getElementById("btnNewBranchWhileBusy");
      if (q) {
        q.addEventListener("click", function () {
          if (q.disabled) return;
          emitMainComposerSend("queue");
        });
      }
      if (b) {
        b.addEventListener("click", function () {
          if (b.disabled) return;
          emitMainComposerSend("branch");
        });
      }
    })();

    document.getElementById("stop").addEventListener("click", () => {
      vscode.postMessage({ type: "cancel" });
    });

    document.getElementById("refresh").addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });

    (function wireThreadVisitNav() {
      var back = document.getElementById("btnSelectionHistoryBack");
      var fwd = document.getElementById("btnSelectionHistoryForward");
      if (!back || !fwd) return;
      back.addEventListener("click", function () {
        if (back.disabled) return;
        vscode.postMessage({ type: "selectionHistoryBack" });
      });
      fwd.addEventListener("click", function () {
        if (fwd.disabled) return;
        vscode.postMessage({ type: "selectionHistoryForward" });
      });
      document.addEventListener(
        "keydown",
        function (ev) {
          if (state.busy) return;
          if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
          if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
          var t = ev.target;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
          if (ev.key === "ArrowLeft" && state.selectionVisitCanGoBack === true) {
            ev.preventDefault();
            vscode.postMessage({ type: "selectionHistoryBack" });
          } else if (ev.key === "ArrowRight" && state.selectionVisitCanGoForward === true) {
            ev.preventDefault();
            vscode.postMessage({ type: "selectionHistoryForward" });
          }
        },
        true,
      );
    })();

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

    var btnDeleteMessageBranch = document.getElementById("btnDeleteMessageBranch");
    if (btnDeleteMessageBranch) {
      btnDeleteMessageBranch.addEventListener("click", () => {
        vscode.postMessage({ type: "deleteMessageBranch" });
      });
    }

    document.getElementById("btnAddNote").addEventListener("click", () => {
      vscode.postMessage({ type: "addNote" });
    });

    document.getElementById("btnListNotesOnSelection").addEventListener("click", () => {
      vscode.postMessage({ type: "listNotesOnSelection" });
    });

    var btnEditMsgTitle = document.getElementById("btnEditMessageTitle");
    if (btnEditMsgTitle) {
      btnEditMsgTitle.addEventListener("click", () => {
        vscode.postMessage({ type: "editMessageTitle" });
      });
    }

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
      closeAllMenus();
      openColcoorListsDrawer("starred");
    });
    document.getElementById("btnTodoDrawer").addEventListener("click", () => {
      closeAllMenus();
      openColcoorListsDrawer("todo");
    });
    document.getElementById("btnStarredTodoDrawer").addEventListener("click", () => {
      closeAllMenus();
      var pref = "starred";
      try {
        var v = localStorage.getItem("colcoor.listsDrawer.tab");
        if (v === "todo" || v === "starred") pref = v;
      } catch (eT) {}
      openColcoorListsDrawer(pref);
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
    document.getElementById("btnClearInlineSideChatReply").addEventListener("click", function () {
      inlineSideChatReplyTargetId = null;
      inlineSideChatUpdateReplyHint();
    });
    document.getElementById("btnInlineSideChatSend").addEventListener("click", () => {
      var ta = document.getElementById("inlineSideChatInput");
      var text = ta && ta.value ? String(ta.value) : "";
      var trimmed = text.trimEnd();
      var imgs = pendingInlineSideChatImages.slice();
      if (!String(trimmed).trim() && !imgs.length) return;
      markInlineSideChatScrollAfterLocalSend();
      var payload = { type: "sendSideChat", text: trimmed };
      if (imgs.length) payload.images = imgs;
      if (inlineSideChatReplyTargetId) {
        payload.referencedSideChatMessageId = inlineSideChatReplyTargetId;
      }
      vscode.postMessage(payload);
      inlineSideChatReplyTargetId = null;
      inlineSideChatUpdateReplyHint();
      if (ta) ta.value = "";
      pendingInlineSideChatImages = [];
      renderPendingInlineSideChatImages();
      updateInlineSideChatSendEnabled();
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
      if (state.busy && state.waitingForAssistant) {
        var qb = document.getElementById("btnQueueAfterReply");
        if (qb && qb.disabled) return;
        e.preventDefault();
        emitMainComposerSend("queue");
        return;
      }
      var sb = document.getElementById("send");
      if (sb && sb.disabled) {
        return;
      }
      e.preventDefault();
      if (sb) sb.click();
    });

    document.getElementById("inlineSideChatMentionPicker").addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest("button.inline-sidechat-mention-item");
      if (!t) return;
      var idx = parseInt(t.getAttribute("data-idx") || "-1", 10);
      if (!isFinite(idx) || idx < 0) return;
      var row = inlineSideChatMentionLastMatches[idx];
      if (row) applyInlineSideChatMentionPick(row);
    });

    document.getElementById("inlineSideChatInput").addEventListener("input", function () {
      updateInlineSideChatMentionPicker();
      updateInlineSideChatSendEnabled();
    });

    document.getElementById("inlineSideChatInput").addEventListener("paste", function (ev) {
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
      var ta = document.getElementById("inlineSideChatInput");
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
            pendingInlineSideChatImages.push({ dataUrl: fr.result });
            renderPendingInlineSideChatImages();
            updateInlineSideChatSendEnabled();
          }
        };
        fr.readAsDataURL(blob);
      });
    });

    document.getElementById("inlineSideChatInput").addEventListener("keydown", function (e) {
      var picker = document.getElementById("inlineSideChatMentionPicker");
      var open = picker && !picker.hidden && picker.querySelector("button.inline-sidechat-mention-item");
      if (open && e.key === "Escape") {
        e.preventDefault();
        closeInlineSideChatMentionPicker();
        return;
      }
      if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        var n = inlineSideChatMentionLastMatches.length;
        if (!n) return;
        if (e.key === "ArrowDown") {
          inlineSideChatMentionSelIndex = Math.min(inlineSideChatMentionSelIndex + 1, n - 1);
        } else {
          inlineSideChatMentionSelIndex = Math.max(inlineSideChatMentionSelIndex - 1, 0);
        }
        highlightInlineSideChatMentionPicker();
        return;
      }
      if (open && e.key === "Tab") {
        e.preventDefault();
        var cur = inlineSideChatMentionLastMatches[inlineSideChatMentionSelIndex];
        if (cur) applyInlineSideChatMentionPick(cur);
        return;
      }
      if (open && shouldSendOnEnter(e)) {
        e.preventDefault();
        var pick = inlineSideChatMentionLastMatches[inlineSideChatMentionSelIndex];
        if (pick) applyInlineSideChatMentionPick(pick);
        return;
      }
      if (!shouldSendOnEnter(e)) return;
      var ta = document.getElementById("inlineSideChatInput");
      var raw = ta && ta.value ? String(ta.value) : "";
      if (!String(raw).trim() && !pendingInlineSideChatImages.length) return;
      e.preventDefault();
      var sb = document.getElementById("btnInlineSideChatSend");
      if (sb && !sb.disabled) sb.click();
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}
