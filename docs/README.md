# Colcoor — Cursor extension documentation

This folder describes the **Colcoor** **Cursor IDE extension**: same conversation-orchestrator concepts as the web app (tree, active node, transcript, notes, side chat), with a **dedicated extension backend** and the **Cursor agent** for **main-thread** generation.

**Normative product principles** (context layers, transcript authority, CLI preference, determinism, UX): see **[principles.md](principles.md)**. If other docs in this folder disagree, **principles.md** wins unless explicitly marked as subordinate.

## What is different from the web app

| Aspect | Web app | Colcoor extension |
|--------|---------|-------------------|
| **Client** | Browser (React) | Cursor extension (VS Code extension host) |
| **Main-thread LLM** | Backend streams from a provider | **Cursor agent**; Colcoor supplies **authoritative** transcript + user message |
| **Backend deployment** | Web backend | **Separate** extension-dedicated backend (no shared service or data with web) |
| **Auth** | Google Sign-In + JWT (see `implementation.md` §9a) | **Cursor account** → backend session (see [authentication.md](authentication.md)) |
| **Server tools on main thread** | Web search, code execution flags on send | **Not used** |
| **Transcript over HTTP** | Web may use debug `GET /transcript` | **No** server transcript endpoints on the extension backend ([principles.md](principles.md)) |

## What stays aligned

- **Domain model** and **user-visible behavior** match the web app where applicable: tree, branching, active node, transcript **semantics** (path, rebuild, no hidden history), notes, private branches (if in scope), **side chat** (server-driven).
- Side chat uses the same **class** of APIs as `implementation.md` §11 (summary, read, CRUD, SSE).

## Document map

| Doc | Purpose |
|-----|---------|
| [principles.md](principles.md) | Core / final principles, context layers, transcript rules, determinism, MCP & cloud scope, UX |
| [architecture.md](architecture.md) | Components, backend role, boundaries |
| [data-flow-and-api.md](data-flow-and-api.md) | Execution flow, **append-event**, **CLI / ACP** agent invocation, errors, side chat |
| [authentication.md](authentication.md) | Cursor-account auth and backend trust |
| [monetization.md](monetization.md) | Tokens on every request, free vs paid feature intent |
| [git-integration.md](git-integration.md) | Loose coupling; optional subtree metadata |
| [ui-features.md](ui-features.md) | User-visible UI feature set (parity with web, exclusions, avatar) |
| [production.md](production.md) | VM deployment: Docker Compose, nginx, Postgres, env, health, operations |

## Authoritative references (repo root)

Tree and formal semantics:

- [formal_model.md](../formal_model.md)
- [implementation.md](../implementation.md)

The extension product implements that contract against its **own** backend; it does **not** call the web app’s backend or share its database.
