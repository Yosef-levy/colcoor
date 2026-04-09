# Data flow and API — Colcoor extension backend

**Overrides:** Where this doc conflicts with earlier drafts, prefer **[principles.md](principles.md)** for transcript authority, context layers, and UX.

Assumes familiarity with `implementation.md` (tree, `parent_event_id`, `needs_context_rebuild`, side chat §11).

## 1. Execution flow (main thread)

1. User **selects** branch anchor (active node / `parent_event_id`; private mode if applicable).
2. Extension **builds transcript** (authoritative context only — root → active, notes, rebuild semantics).
3. Extension calls **`POST …/append-event`** with **`kind: user_input`** (**before** the agent).
4. Extension **triggers** the Cursor agent (prefer **CLI / ACP** — §3).
5. Agent **generates** response (streaming optional — §3.4).
6. Extension calls **`append-event`** with **`kind: assistant_output`** when policy allows (**§4**).
7. Extension **updates UI** from responses / tree patch.

There is **no** `POST …/message/stream` SSE for main-thread completion on this backend. No `use_web_search` or `use_code_execution` on main-thread flows.

## 2. Transcript (no server endpoints)

- Transcript is built **only in the extension**, with the **same serialization** as the web app (copy the web client’s transcript builder / format — readable, structured blocks as today).
- The extension backend **must not** expose endpoints whose purpose is to **return or assemble** the LLM execution transcript (no `GET /transcript`, no “build transcript” RPC). Debug-only server transcript routes from the web stack are **not** part of the extension API surface.

## 3. Agent execution via CLI / ACP (preferred)

The extension should prefer **programmatic** execution of the Cursor agent via a **CLI** or **ACP-style** interface, not dependence on Composer UI automation. That yields more **controlled, reproducible** runs while Cursor still manages **augmented** workspace context internally.

### 3.1 Execution model

Invoke the agent as a **subprocess** or **documented API equivalent**:

- **Working directory:** current **workspace root** (or product-defined multi-root rule).
- **Input:** **full constructed transcript** (from Colcoor tree) + **final user message** (see [principles.md](principles.md) authoritative context).
- **Output:** assistant text (**streaming** or **final** only).

Conceptually:

`run_agent(transcript, workspace_path [, optional_hints]) → response`

Optional hints (extension **may** pass; Cursor may ignore or extend):

- Active file path  
- Selected text  
- Git diff  

Colcoor **does not** reimplement Cursor’s file picking or symbol resolution.

### 3.2 Isolation

Each run **must** be **independent**:

- **Do not** rely on previous CLI invocations or **hidden** session state for **reasoning**.
- All **required** reasoning context **must** appear in the **transcript** (plus explicit user message) passed into this run.

Augmented context may differ between runs; that is allowed under the [principles.md](principles.md) determinism model.

### 3.3 Streaming (optional)

If the CLI supports streaming:

- Capture partial output; **may** render incrementally in UI.
- **Persist** via `append-event` using the **final** text, or **final + partial** only if product policy requires (default: **final**; **interrupt** may persist partial — §4).

### 3.4 Fallback

If CLI / ACP is **unavailable** in an environment:

- Fall back to **Cursor-native** execution (e.g. Composer) using the **same** transcript construction.
- **CLI remains the preferred path** when available.

Prefer **supported** integration; avoid **fragile UI hacks**.

## 4. Error handling

| Situation | `assistant_output` | Notes |
|-----------|----------------------|--------|
| **Agent execution fails** (non-zero exit, error response, no usable text) | **Do not** create | Optional: show error in UI, retry affordance, **no** tree assistant node |
| **User interrupts / cancels** | **Persist partial** | Use whatever partial text the runtime exposes so the tree stays consistent with user-visible outcome |

This **replaces** earlier guidance that always appended an assistant node on stop; **hard failures** omit `assistant_output`.

## 5. Thin REST: append event

Same contract as before; **calls happen** at step 3 (user) and step 6 (assistant when applicable).

**`POST /conversations/{conversation_id}/append-event`**

**Headers:** `Authorization: Bearer <token>` ([authentication.md](authentication.md)).

**A) User message (before agent)**

```json
{
  "kind": "user_input",
  "parent_event_id": "<uuid>",
  "content": "<user message text>",
  "author": "end_user",
  "private_branch": false
}
```

**B) Assistant message (after successful or interrupted generation)**

```json
{
  "kind": "assistant_output",
  "parent_event_id": "<uuid of user_input from A>",
  "content": "<assistant text>",
  "author": "cursor_agent"
}
```

On **hard failure** after user_input was created, **omit** B; optional product-specific **rollback** of the user event is out of scope unless you add an explicit API.

**Alternative routes:** `POST …/events/user-input` and `POST …/events/assistant-output` — same bodies without `kind`.

## 6. Resend / regenerate

- **Do not** create a new `user_input`.
- Transcript = **root → that user message only** (no following assistant block).
- Run agent again; **`append-event`** `assistant_output` as **sibling** under the same `user_input`.

## 7. Side chat (server-driven)

Unchanged intent: extension backend + SSE `type: "side_chat"` per `implementation.md` §11. LLM for side chat (if any) stays **server-side**; not part of the Cursor main-thread CLI path.

## 8. Other endpoints

Reuse web-aligned routes where they still apply: `GET /tree`, `POST /active`, notes, checkpoints, billing, profile — with **no** transcript GET and **no** main-thread stream.

**Disable** `POST …/message/stream` and `POST …/resend/stream` for main-thread completion (or return `410 Gone`).

## 9. Implementation checklist

- [ ] `POST /append-event` (or split routes) for `user_input` / `assistant_output`
- [ ] **No** server transcript endpoints
- [ ] CLI / ACP integration with workspace root + transcript + user message
- [ ] Failure: **no** `assistant_output`; interrupt: **partial** `assistant_output`
- [ ] Isolation: no dependence on hidden cross-run state for reasoning
- [ ] Composer (or equivalent) fallback only when CLI unavailable
- [ ] Side chat + SSE unchanged; monetization headers/tokens on every call ([monetization.md](monetization.md))
