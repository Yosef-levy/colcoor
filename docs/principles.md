# Principles and constraints — Colcoor Cursor extension

This document **complements and overrides** [README.md](README.md), [architecture.md](architecture.md), and [data-flow-and-api.md](data-flow-and-api.md) where they conflict. **Colcoor** is the orchestrator product (tree, transcript, backend); **Cursor** provides execution and code understanding.

---

## Core principle

The system enforces **full control over the conversation transcript**.

The transcript (tree path, notes, active node) is the **authoritative reasoning context**.

The system **does not** attempt to fully control the entire execution environment.

---

## Final principle (summary)

- **Colcoor** controls the **structure and memory** of reasoning (event graph, transcript construction, persistence).
- **Cursor** provides **execution** and **code understanding** (workspace, symbols, optional augmented context).
- **Do not** attempt to replace Cursor’s code intelligence.
- **Do not** give up control over the transcript.

---

## Agent integration

The extension integrates with the **Cursor agent** as the main-thread LLM.

The extension is responsible for:

1. Constructing the transcript **deterministically**
2. Providing the user message
3. Triggering the agent
4. Persisting results via the backend

The system **may** use Cursor-native execution (Composer / agent environment) and does **not** need to bypass it completely.

**Integration quality:** avoid fragile UI automation. Prefer **stable programmatic or supported** paths — see [data-flow-and-api.md](data-flow-and-api.md) §3 (CLI / ACP) and Composer as **fallback**.

---

## Context model (two layers)

### 1. Authoritative context (controlled by Colcoor)

Must always include:

- Transcript built **root → active node**
- Notes injected **deterministically**
- User message

This context **must** be constructed **explicitly** and **consistently**. It is the **only guaranteed reasoning input** for orchestration.

### 2. Augmented context (provided by Cursor)

Cursor **may** add (optional, heuristic):

- Relevant files
- Symbol resolution
- Dependency context
- Additional code snippets

Colcoor **does not** fully replace or replicate this behavior.

---

## Transcript rules

- Transcript is built **client-side** (extension only).
- Same semantics as web:
  - path-based context
  - rebuild when `needs_context_rebuild`
  - no hidden history
- **No server transcript endpoints** on the extension backend: the backend does not serve or assemble transcripts for the agent; it stores the event graph only.

---

## Determinism model

The system guarantees **deterministic conversation structure**, but **not** deterministic execution results.

Given the same transcript:

- The **reasoning path** Colcoor controls is well-defined.
- **Code context** may vary (Cursor-controlled).
- **Model outputs** may vary.

This tradeoff is intentional for developer experience.

---

## Workspace integration (optional hints)

The extension **may** pass to the agent runtime (when supported):

- Active file path
- Selected text
- Git diff

**Full code retrieval** is delegated to Cursor. **Do not** partially or fully reimplement Cursor’s code intelligence in Colcoor.

---

## MCP (future — out of scope for MVP)

- **MVP:** no MCP requirement.
- **Future:** MCP may allow the Cursor agent to call **Colcoor tools**.
- **Current model:** Colcoor drives execution (transcript → append events); the agent is invoked with that contract.

---

## Cloud agents

**Out of scope for MVP.**

---

## UX requirements

The user must **not** be exposed to:

- Raw transcript construction
- Prompt formatting details
- Backend orchestration internals

The experience should feel **native**: select node → run → see result. Implementation details live in logs or developer mode only, not in default UI.

For a **concrete checklist** of screens and controls (settings scope, thread, side chat, collaboration), see [ui-features.md](ui-features.md).
