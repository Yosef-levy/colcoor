# Colcoor — Claude Desktop Extension

A [Claude Desktop Extension (DXT)](https://www.anthropic.com/news/desktop-extensions) that
exposes the **existing Colcoor backend** (`packages/backend`) to Claude Desktop as an MCP
server. It mirrors the conceptual capabilities of the Cursor extension
(`packages/extension`) — conversations, members, the main-thread event graph,
notes, stars, and side chat — but runs over the same HTTP API used by every
other Colcoor client. **No backend code is bundled here; the extension is a
thin orchestration layer.**

> Authentication, route shapes, error semantics, and identity rules are
> authoritative in [`docs/authentication.md`](../../docs/authentication.md) and
> [`docs/api-contracts.md`](../../docs/api-contracts.md). This extension does
> not introduce new APIs.

## What this extension does

It registers an [MCP](https://modelcontextprotocol.io) server (`colcoor`) with
the following surface:

### Tools (39)

| Group | Tools |
|-------|-------|
| Connectivity / auth | `colcoor_health`, `colcoor_session_status`, `colcoor_sign_in_with_cursor`, `colcoor_set_api_token`, `colcoor_sign_out` |
| Profile | `colcoor_who_am_i`, `colcoor_update_profile` |
| Conversations | `colcoor_list_conversations`, `colcoor_create_conversation`, `colcoor_rename_conversation`, `colcoor_set_conversation_pinned`, `colcoor_delete_conversation`, `colcoor_restore_deleted_conversation` |
| Members | `colcoor_list_members`, `colcoor_search_member_invite_candidates`, `colcoor_add_member`, `colcoor_change_member_role`, `colcoor_remove_member` |
| Main-thread tree | `colcoor_get_conversation_tree`, `colcoor_get_active_path`, `colcoor_set_active_event`, `colcoor_get_default_branch_tip`, `colcoor_set_event_checkpoint_label` |
| Stars / branches | `colcoor_star_event`, `colcoor_unstar_event`, `colcoor_delete_event_subtree`, `colcoor_undo_event_delete`, `colcoor_restore_event_subtree` |
| Messaging | `colcoor_append_user_message`, `colcoor_append_assistant_message` |
| Notes | `colcoor_list_notes`, `colcoor_create_note`, `colcoor_update_note`, `colcoor_delete_note` |
| Side chat | `colcoor_list_side_chat_messages`, `colcoor_post_side_chat_message`, `colcoor_edit_side_chat_message`, `colcoor_delete_side_chat_message`, `colcoor_mark_side_chat_read` |

### Prompts

| Name | Purpose |
|------|---------|
| `colcoor_send_message` | Guide Claude through composing and sending a `user_input` message. |
| `colcoor_summarize_conversation` | Pull the tree + notes and summarize, highlighting stars and TODO notes. |

### What this extension does **not** do

- It does **not** run the **Cursor headless agent** (the Cursor extension does
  that locally via the `agent` CLI). In Claude Desktop the assistant *is*
  Claude — when Claude wants to record a reply in the Colcoor main thread, it
  calls `colcoor_append_assistant_message`. There is no `Cursor CLI` dependency.
- It does **not** modify the existing Cursor extension or the backend. All
  source is contained inside `packages/claude_extension/`.

## Layout

```
packages/claude_extension/
├── manifest.json                   # DXT manifest (entry point, user_config)
├── package.json                    # Node deps + npm scripts
├── tsconfig.json                   # strict TS config
├── vitest.config.mts               # unit test config
├── .env.example                    # local dev environment template
├── README.md                       # this file
├── src/
│   ├── index.ts                    # MCP server entry point (stdio transport)
│   ├── server.ts                   # buildColcoorMcpServer (DI wiring)
│   ├── config.ts                   # env → ColcoorExtensionConfig
│   ├── auth.ts                     # in-memory JWT store + cursor-token exchange
│   ├── colcoorClient.ts            # typed HTTP client for /api/v1
│   ├── treeUtils.ts                # default-branch-tip, path helpers
│   ├── toolHelpers.ts              # MCP CallToolResult envelopes
│   ├── tools.ts                    # tool registrations
│   └── prompts.ts                  # prompt registrations
├── scripts/
│   ├── build.mjs                   # esbuild bundle → dist/server.js
│   ├── package.mjs                 # pure-Node ZIP → build/*.dxt
│   ├── smoke-test.mjs              # spawn server, initialize, list tools
│   ├── integration-smoke.mjs       # call colcoor_health against a real backend
│   └── integration-smoke-auth.mjs  # verify auth/HTTP error propagation
└── tests/
    ├── config.test.ts
    ├── colcoorClient.test.ts
    ├── treeUtils.test.ts
    ├── auth.test.ts
    ├── server.test.ts
    └── manifest.test.ts
```

## Configure backend URL & auth

The MCP server reads configuration from environment variables. When installed
as a `.dxt` in Claude Desktop, those variables are populated from the
`user_config` form rendered by Claude Desktop (see `manifest.json`):

| Env var | DXT user_config field | Required | Notes |
|---------|----------------------|----------|-------|
| `COLCOOR_BACKEND_URL` | **Colcoor backend URL** | yes | Origin only (no path, no trailing slash). |
| `COLCOOR_API_TOKEN` | Colcoor API JWT (optional, sensitive) | no | If empty, sign in via `colcoor_sign_in_with_cursor`. |
| `COLCOOR_CURSOR_ACCESS_TOKEN` | Cursor IdP token (optional, sensitive) | no | If set and `COLCOOR_API_TOKEN` is empty, the server exchanges it on startup via `POST /api/v1/auth/cursor`. |
| `COLCOOR_PROVIDER_HINT` | Identity provider hint | no | One of `auto`, `github`, `microsoft`, `google`. Default `auto`. |
| `COLCOOR_AGENT_AUTHOR` | Author label for assistant messages | no | Stored in `events.author` when Claude appends an `assistant_output`. Default `claude_desktop`. |
| `COLCOOR_REQUEST_TIMEOUT_MS` | Per-request timeout (ms) | no | Default `30000`. |

> **TODO (user-specific):** before installing, supply a `COLCOOR_BACKEND_URL`
> for your environment and either a pre-issued Colcoor JWT (`COLCOOR_API_TOKEN`)
> or a Cursor / VS Code IdP access token (`COLCOOR_CURSOR_ACCESS_TOKEN`). See
> [`docs/authentication.md`](../../docs/authentication.md) for how to obtain
> these from the existing Cursor extension flow.

### Sign-out caveat: `colcoor_sign_out` only clears the in-memory token

`colcoor_sign_out` clears the Colcoor API JWT held **in memory** by the MCP
server process. It **cannot** clear the JWT that Claude Desktop persists in
the extension's user-config form (the **Colcoor API JWT** /
`COLCOOR_API_TOKEN` field).

If a value is configured there, Claude Desktop re-loads it into memory the
next time the MCP server is spawned — when you restart Claude Desktop, when
the extension reconnects, or when any user-config field changes — and you
will appear signed in again.

**To permanently sign out** (or recover from a stale/invalid JWT triggering
repeated 401s):

1. Open **Claude Desktop → Settings → Extensions → Colcoor**.
2. Clear the **Colcoor API JWT** field.
3. Also clear the **Cursor / VS Code IdP access token** field if it is set
   (otherwise the MCP server will exchange it for a new JWT on the next
   spawn and you'll be signed in again).
4. Save / restart the extension.

The MCP server cannot do steps 1–3 for you because the user-config store is
owned by Claude Desktop. The `colcoor_sign_out` tool's success message will
remind you of this whenever a persisted token is detected.

Related behavior: when any authenticated tool call returns **HTTP 401**, the
MCP server automatically clears its in-memory JWT (so the next sign-in works
cleanly) and surfaces a structured error envelope to the caller. The
persisted user-config token is **not** touched — same caveat as above
applies. See `handleApiError` in `src/tools.ts` for the implementation and
`tests/handleApiError.test.ts` for the contract.

## Build

```bash
cd packages/claude_extension
npm install
npm run build         # typechecks then bundles into dist/server.js
```

The build is hermetic: the only required tool is **Node ≥ 18**. The bundle
includes all dependencies (`@modelcontextprotocol/sdk`, `zod`) and runs on
the Node runtime shipped with Claude Desktop without `npm install`.

## Local development

Run the MCP server directly against a local backend:

```bash
# 1. Start the existing Colcoor backend (unchanged):
cd packages/backend
.venv/bin/uvicorn colcoor_backend.main:app --host 127.0.0.1 --port 8000

# 2. In another shell, build and start the MCP server:
cd packages/claude_extension
cp .env.example .env          # then edit .env (URL + token)
npm install
npm run build
set -a; source .env; set +a   # load env vars into the shell
node dist/server.js           # MCP server speaks JSON-RPC over stdio
```

To iterate quickly without rebuilding each time:

```bash
npm run watch                 # esbuild rebuild loop
```

### Smoke tests

- `npm run smoke` — spawns the bundle, initializes the protocol, calls
  `tools/list`, and confirms ≥ 10 tools are registered. No backend required.
- `npm run smoke:integration` — calls the `colcoor_health` tool against the
  `COLCOOR_BACKEND_URL` you export. Requires a running backend.
- `npm run smoke:integration:auth` — calls `colcoor_list_conversations` with a
  bogus token and asserts the MCP server cleanly propagates an HTTP error
  envelope (401 / 403 / 503 depending on backend state).
- `npm test` — full Vitest suite (39 unit tests covering config parsing,
  HTTP client error handling, tree helpers, auth flow, manifest shape).

## Package (.dxt distributable)

```bash
npm run package
```

Output: `build/colcoor-claude-extension-<version>.dxt`. This is a standard ZIP
containing `manifest.json`, `server.js`, and `server.js.map` at the archive
root — exactly the layout Claude Desktop expects.

The packaging script is **dependency-free**: it writes the ZIP using only
`node:zlib`, so you do not need the system `zip` binary.

## Install in Claude Desktop

1. Run `npm run package` to produce
   `build/colcoor-claude-extension-<version>.dxt`.
2. Open **Claude Desktop → Settings → Extensions** (the menu name may vary
   slightly by version).
3. Click **Install Extension** (or **Install from file…**) and choose the
   `.dxt` you just built.
4. Fill in the user-config fields rendered by Claude Desktop. At minimum you
   need:
   - **Colcoor backend URL** — e.g. `https://colcoor.example.com` or
     `http://127.0.0.1:8000` for local development.
   - **Colcoor API JWT** — paste the bearer token obtained via the Cursor
     extension sign-in flow. Alternatively, leave it blank and provide a
     **Cursor / VS Code IdP access token**; the extension will exchange it
     for a JWT on startup.
5. Claude Desktop will spawn `node server.js` from the unpacked bundle and
   talk to it over stdio. You can then invoke the tools (e.g. ask Claude
   "list my Colcoor conversations") or use the slash-prompt templates.

## Test locally end-to-end

```bash
# Backend
cd packages/backend
.venv/bin/uvicorn colcoor_backend.main:app --host 127.0.0.1 --port 8000

# Extension
cd packages/claude_extension
npm install
npm run build
COLCOOR_BACKEND_URL=http://127.0.0.1:8000 npm run smoke:integration

# Optional: prove that an invalid token surfaces a structured HTTP error envelope
COLCOOR_BACKEND_URL=http://127.0.0.1:8000 npm run smoke:integration:auth
```

You can also exercise the JSON-RPC protocol by hand:

```bash
set -a; source .env; set +a
node dist/server.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
```

(Each line is a separate JSON-RPC message; the server replies on stdout.)

## How it relates to the Cursor extension

| Concept | Cursor extension (`packages/extension`) | This Claude Desktop extension |
|---------|------------------------------------------|-------------------------------|
| **HTTP client** | `src/api/client.ts` (VS Code-coupled) | `src/colcoorClient.ts` (plain Node) |
| **Auth (JWT exchange)** | `src/auth/cursorSession.ts` + VS Code SecretStorage | `src/auth.ts` (in-memory) + `COLCOOR_API_TOKEN` user_config |
| **Commands** | VS Code commands (`colcoor.*`) | MCP tools (`colcoor_*`) |
| **Main-thread agent** | Spawns Cursor headless CLI locally | Not applicable: Claude *is* the assistant. Use `colcoor_append_assistant_message` to persist replies. |
| **Sidebar / panels** | VS Code TreeView + Webview UI | MCP tool calls; Claude renders the JSON/Markdown summaries returned by tools. |

Reading both side by side is the fastest way to confirm the behavior is
consistent (same routes, same role/permission semantics, same error envelope).

## Notes for maintainers

- All Colcoor-specific HTTP routes go through `ColcoorApiClient`. Adding a new
  route is a two-step process: (1) add a typed method there, (2) register a
  tool in `src/tools.ts` that calls it. Update the `tools` array in
  `manifest.json` so Claude Desktop's UI lists the new tool without spawning
  the server.
- Error semantics intentionally mirror the Cursor extension: `401` clears the
  in-memory JWT (so the next sign-in works cleanly); other errors are returned
  as MCP tool error envelopes (`isError: true`) with `http_status` exposed in
  `structuredContent` for callers.
- The packaging script (`scripts/package.mjs`) writes a ZIP archive directly
  from Node — no external `zip` binary, no extra npm dep.
- Version bumps go in **two** places: `package.json` (`version`) and
  `manifest.json` (`version`). The packaging script uses the `package.json`
  value for the output filename.
