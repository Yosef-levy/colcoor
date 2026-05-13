# Principles and constraints — Colcoor

This document **complements and overrides** other files in this folder where noted. **Colcoor** is the orchestrator (tree, transcript, backend); **Cursor** provides execution and code understanding on the main-thread agent path.

Unless otherwise noted, the principles below describe the **Cursor extension** main-thread flow — that is the path that builds the deterministic transcript and invokes the Cursor agent. The **Claude Desktop extension** ([`packages/claude_extension/`](../packages/claude_extension/)) is a second first-party client that calls the same backend through MCP tools; it is **not** a main-thread agent host and does not build the transcript. Where a principle applies only to the main-thread flow, it says so explicitly.

**Normative HTTP surface:** [api-contracts.md](api-contracts.md).

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

## Agent integration (Cursor extension — main thread)

The **Cursor extension** integrates with the **Cursor agent** as the main-thread LLM.

The extension is responsible for:

1. Constructing the transcript **deterministically**
2. Providing the user message
3. Triggering the agent
4. Persisting results via the Colcoor backend

The system **may** use Cursor-native execution (Composer / agent environment) and does **not** need to bypass it completely.

**Integration quality:** avoid fragile UI automation. Prefer **stable programmatic or supported** paths — see [data-flow-and-api.md](data-flow-and-api.md) §2 (CLI / ACP) and Composer as **fallback**.

**Claude Desktop extension:** Claude itself is the LLM, so there is no separate main-thread agent to drive. The Claude Desktop extension exposes the backend through MCP tools and lets Claude record replies via `colcoor_append_assistant_message`. The transcript-construction principle below applies only to the Cursor extension path.

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

- Transcript is built **only client-side** by the **Cursor extension** (main-thread agent path). Clients that are not main-thread agent hosts (e.g. the Claude Desktop extension) do not implement this format.
- Semantics:
  - **Path-based** context along the active branch ([domain-model.md](domain-model.md)).
  - **Rebuild** when `needs_context_rebuild` is true ([domain-model.md](domain-model.md) §4).
  - **No hidden history** in the transcript: only what the tree path and notes encode.
- **No server transcript endpoints:** the backend does not return or assemble LLM execution transcripts; it stores the event graph only.

Format: [transcript-format.md](transcript-format.md).

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

## MCP (external clients vs main-thread agent)

- **External MCP clients (supported):** the Claude Desktop extension at [`packages/claude_extension/`](../packages/claude_extension/) is a first-party MCP server that exposes the Colcoor backend (conversations, tree, notes, side chat, messaging) to Claude Desktop. It does **not** host a main-thread agent or build the transcript described above.
- **Main-thread agent via MCP (out of scope for MVP):** letting the **Cursor agent** itself call Colcoor tools through MCP is still future work; the current Cursor extension path remains transcript → `append-event` with the Cursor agent invoked out-of-process.
- **Current model:** Colcoor (the backend) is the source of truth for conversation structure; clients are responsible for translating user intent into the documented `/api/v1` routes, whether through VS Code commands or MCP tool calls.

---

## Cloud agents

**Out of scope for MVP.**

---

## UX requirements

The user must **not** be exposed to:

- Raw transcript construction
- Prompt formatting details
- Backend orchestration internals

The experience should feel **native**: select node → run → see result. Implementation details belong in logs or developer mode only, not in default UI.

For a **concrete checklist** of screens and controls, see [ui-features.md](ui-features.md). **Conversation tree** state, selection, and separation from actions: [tree-ui-contract.md](tree-ui-contract.md).