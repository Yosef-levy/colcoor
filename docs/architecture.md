# Architecture — Colcoor Cursor extension

See **[principles.md](principles.md)** for the core split: Colcoor controls **transcript and structure**; Cursor controls **execution environment** and **augmented** code context — without Colcoor reimplementing Cursor’s intelligence.

## 1. Goal

Deliver a **Cursor extension** for **Colcoor** so users work with the same orchestrator concepts as the web UI, while the **Cursor agent** performs main-thread generation. Persistence (event graph, side chat, permissions, billing) lives on an **extension-specific backend** aligned with `implementation.md`, except where this doc set explicitly differs (e.g. no main-thread LLM on server, no transcript HTTP API).

## 2. Backend role

The backend is the **source of truth** for:

- Event graph (`user_input` / `assistant_output`)
- Conversation tree and membership
- Notes
- Side chat
- Permissions
- Billing / entitlements ([monetization.md](monetization.md))

The backend **does not**:

- Run the **main-thread** LLM
- Construct **execution** transcripts for the agent (transcript is **extension-only**; see [principles.md](principles.md))

## 3. System components

```mermaid
flowchart LR
  subgraph ide [Cursor IDE / workspace]
    Ext[Colcoor extension]
    CLI[Agent CLI or ACP subprocess]
  end
  subgraph extbe [Extension backend]
    API[HTTP API]
    DB[(Database)]
  end
  Ext -->|Bearer token| API
  Ext -->|append-event, tree, side chat| API
  API --> DB
  Ext -->|transcript plus user message, cwd = workspace| CLI
  CLI -->|response stream or final| Ext
```

- **Extension** — Builds **authoritative** transcript (root → active, notes, user message); calls **append-event**; invokes agent via **CLI / ACP** when available ([data-flow-and-api.md](data-flow-and-api.md) §3); persists assistant text after completion or interrupt per error policy.
- **Cursor agent runtime** — Subprocess or supported API: `run_agent(transcript, workspace_path, …) → response`. May add **augmented** context (files, symbols) internally; Colcoor does not duplicate that layer.
- **Extension backend** — Own deployment and database; **append-event** and full tree/side-chat surface; **no** main-thread streaming LLM.
- **Web app backend** — **Out of scope**; no sync or shared DB unless added later as a separate project.

## 4. Agent integration (responsibilities)

The extension **must**:

1. Construct the transcript **deterministically** (same rules as web).
2. Provide the user message.
3. Trigger the agent (prefer **programmatic** path; Composer as fallback — [data-flow-and-api.md](data-flow-and-api.md) §3).
4. Persist via **`append-event`** and other existing REST contracts.

Avoid fragile Composer **UI** automation when a **stable** CLI or API exists.

## 5. Behavioral parity vs implementation reuse

- **Parity** — Users recognize Colcoor: conversations, branches, active node, transcript behavior, notes, side chat (`formal_model.md`, `implementation.md`).
- **Reuse** — Same repo or fork for the Python backend is optional; deployments stay **separate** from web.

## 6. Main-thread LLM boundary

- Extension backend does **not** implement `POST …/message/stream` for Colcoor main-thread completion (disable or `410`).
- Flow: **append `user_input`** → **run agent** → **append `assistant_output`** (with failure/interrupt rules in [data-flow-and-api.md](data-flow-and-api.md) §4–§5).

**Web search** and **server code execution** flags are **out of scope** on the main thread.

## 7. Side chat

Server-driven on the extension backend; SSE `type: "side_chat"` per `implementation.md` §11. Persistence does **not** go through the Cursor main-thread agent.

## 8. Git and workspace

- Optional **hints** to the agent: active file, selection, diff ([principles.md](principles.md)).
- Git ↔ tree coupling: [git-integration.md](git-integration.md).

## 9. Non-goals (MVP)

- **MCP** and **cloud agents** — [principles.md](principles.md).
- Sharing cookies/DB with **web** deployment.
- Replacing Cursor’s file/symbol intelligence.
