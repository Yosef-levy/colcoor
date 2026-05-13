# Architecture — Colcoor

See **[principles.md](principles.md)** for the split between **Colcoor** (transcript + structure + persistence) and **Cursor** (execution + optional augmented code context) on the main-thread agent path.

## 1. Goal

Ship a **Colcoor backend** plus first-party client extensions so users manage **branching conversations**:

- the **Cursor / VS Code extension** ([`packages/extension`](../packages/extension)) runs the **Cursor agent** on the main thread and builds the deterministic transcript;
- the **Claude Desktop extension** ([`packages/claude_extension`](../packages/claude_extension)) is a DXT-packaged MCP server that exposes the same backend to Claude Desktop, where Claude itself is the LLM.

The backend stores the **event graph**, **notes**, **side chat**, **membership**, and **billing**; it does **not** run any main-thread LLM. See **[domain-model.md](domain-model.md)** for semantics.

## 2. Backend role

The Colcoor backend is the **source of truth** for:

- Event graph (`user_input` / `assistant_output`)
- Conversation metadata and membership
- Notes
- Side chat
- Permissions
- Billing and usage ([monetization.md](monetization.md), [billing-usage.md](billing-usage.md))

The backend **does not**:

- Run the **main-thread** LLM (that is Cursor)
- Build or serve **execution transcripts** for the agent ([principles.md](principles.md))

## 3. System components

```mermaid
flowchart LR
  subgraph ide [Cursor IDE / workspace]
    Ext[Colcoor Cursor extension]
    CLI[Cursor agent CLI or ACP subprocess]
  end
  subgraph claude [Claude Desktop]
    DXT[Colcoor MCP server\npackages/claude_extension]
  end
  subgraph colcoor [Colcoor backend]
    API[HTTP API]
    DB[(Database)]
  end
  Ext -->|Bearer token| API
  Ext -->|append-event, tree, side chat| API
  DXT -->|Bearer token| API
  DXT -->|same routes as Cursor extension| API
  API --> DB
  Ext -->|transcript plus user message, cwd = workspace| CLI
  CLI -->|response stream or final| Ext
```

- **Cursor extension** — Builds the **authoritative** transcript; calls **`append-event`**; runs the Cursor agent via **CLI / ACP** when available ([data-flow-and-api.md](data-flow-and-api.md)); updates UI from API responses. **Conversation tree** UI contract (selection vs actions, multi-layout readiness): [tree-ui-contract.md](tree-ui-contract.md).
- **Cursor agent runtime** — Subprocess or supported API; may add files/symbols internally; Colcoor does not duplicate that layer.
- **Claude Desktop extension (MCP server)** — Translates Claude Desktop tool calls into the same `/api/v1` routes. **Does not** build the transcript and **does not** run a main-thread agent; Claude itself is the LLM and persists replies through `colcoor_append_assistant_message`. See [`packages/claude_extension/README.md`](../packages/claude_extension/README.md).
- **Colcoor backend** — HTTP API and database ([database.md](database.md), [api-contracts.md](api-contracts.md)); **append-event** and related routes; no server-side main-thread streaming completion.

## 4. Agent integration (Cursor extension responsibilities)

The Cursor / VS Code extension is responsible for:

1. Construct the transcript **deterministically** ([domain-model.md](domain-model.md), [transcript-format.md](transcript-format.md)).
2. Provide the **user message** for the turn.
3. **Trigger** the Cursor agent (prefer programmatic CLI/ACP; Composer-style fallback if needed).
4. **Persist** results with **`append-event`** and other Colcoor APIs.

Prefer **stable programmatic** integration over fragile UI automation.

The Claude Desktop extension does not perform steps 1 and 3; Claude itself reasons over the live tool responses and calls `colcoor_append_user_message` / `colcoor_append_assistant_message` to perform steps 2 and 4.

## 5. Independence

This **documentation set** defines the Colcoor product (backend + client extensions) **on its own**. Implementation may live in any repository layout; these files do not depend on another product’s codebase or documentation.

## 6. Main-thread boundary

- No server-side main-thread streaming completion API; use **`append-event`** + Cursor agent ([data-flow-and-api.md](data-flow-and-api.md)).
- **Server-side web search and code execution** as Colcoor-driven main-thread tools are **out of scope** for this product.

## 7. Side chat

Persisted and loaded **only** through the Colcoor backend; realtime via **SSE** (see [domain-model.md](domain-model.md) §6). Not routed through the Cursor main-thread agent for persistence. Available to all clients (the Claude Desktop extension exposes it as the `colcoor_list_side_chat_messages` / `colcoor_post_side_chat_message` tools; SSE streaming is currently surfaced only by the Cursor extension).

## 8. Git and workspace

Optional hints to the agent (active file, selection, diff): [principles.md](principles.md). Git metadata vs tree: [git-integration.md](git-integration.md). These hints are **Cursor-extension-only**; the Claude Desktop extension does not have a workspace concept.

## 9. Non-goals (MVP)

- **Cloud agents** — out of scope for MVP ([principles.md](principles.md)).
- Driving the **Cursor main-thread agent** via MCP — still out of scope (see [principles.md](principles.md) § MCP); MCP support is currently for **external clients** such as the Claude Desktop extension only.
- Replacing Cursor’s file/symbol intelligence.
