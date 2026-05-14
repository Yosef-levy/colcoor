# Colcoor Claude extension — MCP Apps (embedded UI)

This package implements a **Model Context Protocol (MCP) App** surface for Claude Desktop: an HTML view that renders **inside the chat** when a tool with `_meta.ui.resourceUri` is executed, using the official MCP Apps extension (not a separate hosted website).

## What Claude Desktop supports today

Per the [MCP Apps specification](https://modelcontextprotocol.io/docs/extensions/apps.md) and [SEP detail](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx):

| Capability | How Colcoor uses it |
|------------|---------------------|
| **`ui://` resources** | `resources/read` returns `text/html;profile=mcp-app` for `ui://colcoor/conversation-explorer`. |
| **Tool → UI binding** | `colcoor_open_conversation_explorer` declares `_meta.ui.resourceUri` pointing at that resource. |
| **Sandboxed iframe** | Claude Desktop loads the HTML in an isolated iframe with CSP defaults (no network unless declared on the resource). |
| **JSON-RPC over `postMessage`** | The embedded script speaks `ui/initialize`, `ui/notifications/initialized`, receives `ui/notifications/tool-result`, and calls `tools/call`, `ui/update-model-context`, and `ui/notifications/size-changed`. |
| **Interactive tool calls** | The iframe proxies `tools/call` to the same MCP server (e.g. `colcoor_set_active_event`, `colcoor_get_active_path`). |

## What remains impossible or host-dependent

- **No arbitrary network from the view** unless `_meta.ui.csp.connectDomains` (or related CSP fields) is set on the resource. Colcoor keeps the default restrictive CSP: the app talks to the host only, not directly to your Colcoor backend.
- **Host feature parity**: MCP Apps are supported in Claude Desktop, but exact UI chrome, approval prompts for tool calls from the iframe, and how `ui/update-model-context` is merged into the model may vary by release.
- **Not a replacement for the full Colcoor web UI**: this is a minimal graph navigator focused on branch context, not full editing, permissions, or rich formatting.

## Tools and resources

- **Resource**: `ui://colcoor/conversation-explorer` — static HTML shell + inline JavaScript bootstrapping the MCP App protocol.
- **Tool**: `colcoor_open_conversation_explorer` — loads tree + active path (+ optional side-chat slice) and returns structured JSON. When the host supports MCP Apps, it also renders the embedded explorer.

## Example interaction flow

1. User (or Claude) runs **`colcoor_open_conversation_explorer`** with `{ "conversation_id": "<uuid>" }`.
2. The server returns a tool result whose **`structuredContent`** carries `{ tree, caller_state, active_path, side_chat? }`.
3. Claude Desktop **prefetches** the `ui://` HTML (via `resources/read`), opens the iframe, runs **`ui/initialize`**, then streams **`ui/notifications/tool-input`** / **`tool-result`** into the view.
4. The user **clicks an event** in the tree. The iframe sends **`tools/call`** for `colcoor_set_active_event`, then **`colcoor_get_active_path`**, then **`ui/update-model-context`** so the model’s subsequent turns know which event is pinned.
5. **Refresh** / **side-chat load** buttons issue additional `tools/call` requests for read-only endpoints already exposed by this server.

## Local run and packaging

Same as the rest of this package:

- `npm run build` — typecheck + bundle `dist/server.js`.
- `npm run package` — produce `build/colcoor-claude-extension-<version>.dxt`.
- Install the `.dxt` in Claude Desktop under **Settings → Extensions → Install from file…**.

No extra build step is required for the MCP App: the HTML is generated in-process when the server handles `resources/read`.

## References

- [MCP Apps overview](https://modelcontextprotocol.io/docs/extensions/apps.md)
- [MCP Apps API / spec (ext-apps)](https://apps.extensions.modelcontextprotocol.io/)
- [Example servers (ext-apps repo)](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples)
