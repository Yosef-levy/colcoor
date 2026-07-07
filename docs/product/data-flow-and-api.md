# Data flow and API — Colcoor extension

This document defines **execution order** and **behavioral invariants** for the main thread and points to the **normative HTTP** specification.

**Normative HTTP (paths, bodies, status codes):** **[api-contracts.md](api-contracts.md)**  
**Tree, `visible_to`, active state, notes, side chat:** **[domain-model.md](domain-model.md)**  
**Tree UI (selection vs actions, node state):** **[tree-ui-contract.md](tree-ui-contract.md)**  
**Transcript text format:** **[transcript-format.md](transcript-format.md)**  
**Transcript authority vs Cursor context:** **[principles.md](../principles.md)**  
**Roles and 403 rules:** **[permissions.md](permissions.md)**  
**Usage and 402:** **[billing-usage.md](../auth/billing-usage.md)**

---

## 1. Main-thread execution order

1. Caller ensures branch anchor and visibility mode per **[domain-model.md](domain-model.md)** §3–§4.
2. Extension builds the **transcript** per **[transcript-format.md](transcript-format.md)** and **[principles.md](../principles.md)**.
3. **`POST /api/v1/conversations/{id}/append-event`** with **`kind: user_input`** **before** invoking the agent ([api-contracts.md](api-contracts.md) §6).
4. Extension invokes the **Cursor agent** (prefer CLI / ACP; see §2).
5. On success or user interrupt, **`append-event`** with **`kind: assistant_output`** when policy requires a persisted assistant turn ([api-contracts.md](api-contracts.md) §6; error table §3 below).
6. Extension refreshes UI from **`GET …/tree`** and related endpoints.

There is **no** server-side SSE for main-thread completion. The extension **MUST NOT** send server web-search or code-execution flags on this path.

---

## 2. Agent handoff (non-normative transport)

- **Working directory:** workspace root (or product multi-root rule).
- **Inputs:** transcript string + final user message per **[principles.md](../principles.md)**.
- **Output:** assistant text (stream or final). Optional hints (active file, selection, diff) **may** be passed; Cursor may augment.

**Isolation:** each run **MUST NOT** rely on hidden cross-run state for reasoning; required context is in the transcript payload.

**Preferred integration:** programmatic CLI or ACP-style API. **Fallback:** Cursor-native execution with the **same** transcript builder.

---

## 3. Error handling (main thread)

| Situation | `assistant_output` row | Client |
|-----------|-------------------------|--------|
| Agent **hard failure** (no usable assistant text) | **Do not** append | Show error; optional retry |
| User **interrupt** | **Append partial** text if available | Aligns tree with user-visible outcome |

---

## 4. Resend / regenerate

- **Do not** create a new **`user_input`**.
- Transcript for the run = **root → that existing `user_input` only** (no following assistant block) per **[transcript-format.md](transcript-format.md)** resend semantics.
- Run agent again; append a new **`assistant_output`** **sibling** under the same **`parent_event_id`** ([domain-model.md](domain-model.md) §3.2).

---

## 5. Side chat

Server persistence and **SSE** are specified in **[api-contracts.md](api-contracts.md)** §10 and **[domain-model.md](domain-model.md)** §6. Side chat **does not** use the main-thread **`append-event`** path.

User-authored side-chat rows may include **`content_json.colcoor_user_media`** (image refs from **`POST …/images`**, same as main-thread `user_input`) so pasted images are durable rows in the side-chat transcript, not local-only UI.

---
