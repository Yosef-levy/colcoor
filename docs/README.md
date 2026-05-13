# Colcoor — product documentation

Standalone **product specification** for the **Colcoor HTTP backend** and its first-party clients (the **Cursor / VS Code extension** in [`packages/extension`](../packages/extension) and the **Claude Desktop extension** in [`packages/claude_extension`](../packages/claude_extension)): branching conversations (tree, active node, transcript, notes, side chat).

The **Cursor extension** uses the **Cursor agent** as the main-thread generator and builds the deterministic transcript locally. The **Claude Desktop extension** is an MCP server that exposes the same backend; Claude Desktop itself is the LLM and persists replies through tool calls — it does **not** build the agent transcript described in [transcript-format.md](transcript-format.md).

**Normative principles** (transcript authority, context layers, determinism, UX): **[principles.md](principles.md)**. On conflict, **principles.md** wins unless another doc explicitly defers.

## What Colcoor is

- **Structured memory:** explicit **tree** of **`user_input`** / **`assistant_output`** events, **branching**, per-user **active node**.
- **Notes** on messages (not tree nodes).
- **Side chat** per conversation ([domain-model.md](domain-model.md) §6).
- **Transcript:** deterministic text built **only client-side** by the **Cursor extension** ([transcript-format.md](transcript-format.md)); the backend **does not** expose transcript-over-HTTP. Clients that are not main-thread agent hosts (e.g. the Claude Desktop extension) do not build this transcript.

## Document map

| Doc | Purpose |
|-----|---------|
| [principles.md](principles.md) | Transcript authority vs Cursor context; determinism; UX |
| [api-contracts.md](api-contracts.md) | **Normative REST + SSE** (paths, JSON schemas, status codes, auth) |
| [permissions.md](permissions.md) | Role matrix (**owner** / **editor** / **viewer**) and enforcement locus |
| [billing-usage.md](billing-usage.md) | **`usage_monthly`** vs **`usage_events`**; **402** / quotas |
| [domain-model.md](domain-model.md) | Tree semantics, **`visible_to`**, **`active_event_id`**, notes, side chat |
| [database.md](database.md) | PostgreSQL DDL aligned to the API |
| [data-flow-and-api.md](data-flow-and-api.md) | Main-thread turn order and agent handoff (**references api-contracts**) |
| [transcript-format.md](transcript-format.md) | Agent transcript wire format |
| [authentication.md](authentication.md) | **`cursor_sub`**; **`POST /api/v1/auth/cursor`** |
| [monetization.md](monetization.md) | Tokens on every request; links **billing-usage** |
| [architecture.md](architecture.md) | Components and boundaries |
| [production.md](production.md) | Docker, nginx, Postgres, env, health, release artifacts, enterprise bundle (`npm run bundle:enterprise`) |
| [enterprise-handoff-checklist.md](enterprise-handoff-checklist.md) | Copy-paste checklist for customer IT / security rollout |
| [git-integration.md](git-integration.md) | Optional Git metadata |
| [ui-features.md](ui-features.md) | User-visible UI checklist (thread, tree, drawers / in-conversation search, side-chat settings, 401 handling) |
| [tree-ui-contract.md](tree-ui-contract.md) | **Normative** conversation tree: node state, selection vs actions, future layouts |

Cross-references are **within this folder** unless the link is a public standard (e.g. VS Code SecretStorage).

> **Other clients:** the Claude Desktop reference client lives outside this folder at [`../packages/claude_extension/README.md`](../packages/claude_extension/README.md). It calls the same `/api/v1` routes documented here — no parallel spec is needed.
