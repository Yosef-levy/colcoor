import { buildExplorerBootScript } from "./explorerBootScript.js";

/**
 * Full HTML5 document served as `text/html;profile=mcp-app` for Claude Desktop's MCP App iframe.
 */
export function getConversationExplorerHtml(): string {
  const script = buildExplorerBootScript();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Colcoor conversation explorer</title>
  <style>
    :root {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: var(--color-text-primary, #111);
      background: var(--color-background-primary, #fafafa);
    }
    body { margin: 0; padding: 8px 10px 16px; }
    #err {
      background: var(--color-background-danger, #fee2e2);
      color: var(--color-text-danger, #991b1b);
      padding: 8px 10px;
      border-radius: 6px;
      margin-bottom: 10px;
    }
    .hdr { margin-bottom: 12px; }
    .title { font-weight: 700; font-size: 1.05rem; }
    .sub { font-size: 0.8rem; opacity: 0.85; margin-top: 4px; }
    .hint { font-size: 0.85rem; line-height: 1.35; margin: 8px 0 0; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.78rem; }
    .actions { margin-top: 8px; }
    button {
      cursor: pointer;
      border-radius: 6px;
      border: 1px solid var(--color-border-primary, #ccc);
      padding: 6px 10px;
      background: var(--color-background-secondary, #fff);
    }
    h2 { font-size: 0.95rem; margin: 14px 0 6px; }
    .tree { border: 1px solid var(--color-border-secondary, #ddd); border-radius: 8px; padding: 6px 0; background: var(--color-background-secondary, #fff); max-height: 420px; overflow: auto; }
    .row { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
    .row:hover { background: #f3f4f6; }
    .row.active { background: #dbeafe; outline: 1px solid #3b82f6; }
    .row.onpath { background: #eff6ff; }
    .pill { display: inline-block; font-size: 0.72rem; padding: 1px 6px; border-radius: 999px; background: #e5e7eb; margin-right: 6px; }
    .idtag { opacity: 0.9; }
    .snippet { margin-top: 4px; font-size: 0.82rem; color: #374151; white-space: pre-wrap; }
    .side { border: 1px solid var(--color-border-secondary, #ddd); border-radius: 8px; padding: 6px; max-height: 220px; overflow: auto; background: #fff; }
    .srow { padding: 6px 4px; border-bottom: 1px solid #f3f4f6; font-size: 0.82rem; }
    .muted { color: #6b7280; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div id="err" hidden></div>
  <div id="app"><p class="muted">Initializing Colcoor explorer…</p></div>
  <script>${script}</script>
</body>
</html>`;
}
