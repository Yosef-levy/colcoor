# Domain model — Colcoor extension

Normative **conversation structure**, **visibility**, **main-thread events**, and **client-visible state**. **HTTP payloads and status codes:** [api-contracts.md](api-contracts.md). **Role matrix:** [permissions.md](permissions.md).

---

## 1. Product shape

- A **conversation** is a shared workspace: a **tree of main-thread messages**, **notes** attached to messages, **per-user** active cursor and rebuild flag, **members** with roles, and a **side chat** channel separate from the main tree.
- The **extension** builds the **agent transcript** from the tree ([transcript-format.md](transcript-format.md)). The **backend** persists **`events`**, **`notes`**, membership, side chat, and usage.

---

## 2. Conversations and membership

- **Metadata:** **`title`** (optional, shared), timestamps on **`conversations`**; **per-user `pinned`** on **`conversation_members`** ([database.md](database.md) §2–§3).
- **`conversation_members`:** each member has **`role`** ∈ { **`owner`**, **`editor`**, **`viewer`** }.
- **Exactly one `owner` per conversation** (product invariant). Enforced by a **partial unique index** on **`(conversation_id)`** where **`role = 'owner'`** and by **application logic** on every membership mutation ([database.md](database.md), [permissions.md](permissions.md)).
- **Only members** may read or mutate that conversation’s data, subject to [permissions.md](permissions.md).
- **Owner delete conversation** sets **`conversations.deleted_at`** and soft-deletes **every** live **`events`** row in one batch (**`deletion_group_id`** / **`deleted_by_user_id`**), same undo window and restore semantics as subtree delete ([api-contracts.md](api-contracts.md) §3.4–§3.5, §7.5–§7.7).

---

## 3. Event graph (main thread)

Stored in **`events`**. Columns include **`id`**, **`conversation_id`**, **`parent_event_id`**, **`kind`**, **`actor_type`**, **`actor_user_id`**, **`content_text`**, **`content_json`**, **`visible_to`**, **`deleted_at`**, timestamps.

### 3.1 Allowed `kind` values (main thread)

The **only** allowed values for **`events.kind`** are:

- **`user_input`**
- **`assistant_output`**

There are **no** other main-thread event kinds in this product scope.

### 3.2 Parent rules

- **`parent_event_id`** is **`NULL`** only for the **single root** `user_input` event created when the conversation is created.
- A new **`user_input`** **MUST** reference an existing event in the same conversation as **`parent_event_id`** (the branch anchor). The anchor **MUST** be visible to the caller per **`visible_to`** rules below.
- A new **`assistant_output`** **MUST** reference the **`user_input`** it answers as **`parent_event_id`**.
- **Resend / regenerate:** additional **`assistant_output`** events **share** the same **`parent_event_id`** (that `user_input`) as **siblings** of prior assistant nodes.

### 3.3 Shared vs private (`visible_to`)

- **`visible_to` is `NULL`:** the event is **shared**; all members see it in the default tree.
- **`visible_to` equals a `users.id`:** the event is a **private draft** for that user only. Other members **MUST NOT** see it in shared tree responses. The owning user sees it when loading the tree in **private** mode or when the API includes private drafts for the caller.
- **Private `user_input`** may have child **`assistant_output`** events that remain private until **committed** (promoted to **`visible_to = NULL`** per [permissions.md](permissions.md)).

### 3.4 Soft delete (`deleted_at`)

- When **`deleted_at`** is set on an **`events`** row, that row is **hidden** from tree and note-list APIs for members (same rules as other graph reads).
- **Deleting a node** (product action) sets **`deleted_at`** on that node and **every descendant** in one operation. **Stars** on those events are removed for all users; **notes** on those events no longer appear in list endpoints.
- **Appending** with **`parent_event_id`** pointing at a soft-deleted anchor **inherits** the parent’s **`deleted_at`** on the new row so **late or racing writes** still land in the hidden subtree.
- The **conversation root** (the single **`parent_event_id IS NULL`** non-deleted row) **MUST NOT** be soft-deleted.
- **Retention:** the server **may** permanently delete soft-deleted rows after a configurable age (default **14 days**). Dependent rows with **`ON DELETE CASCADE`** (e.g. **notes**, **stars**) disappear with the event; **`active_event_id`** is repointed to the live root before hard delete.
- **Deletion batch:** each subtree delete assigns a shared **`deletion_group_id`** and records **`deleted_by_user_id`**. The same user may **undo** within a short window (default **5 minutes**) via the API. **Owner** and **editor** may **restore** later by **`POST …/events/{anchor}/restore-subtree`**, which clears soft-delete for every row still sharing that anchor’s **`deletion_group_id`**.

---

## 4. Per-user conversation state

Table **`conversation_user_state`:** one row per **`(conversation_id, user_id)`** ([database.md](database.md) §5).

| Field | Meaning |
|-------|---------|
| `active_event_id` | Branch anchor for the **next** main-thread send unless the client overrides `parent_event_id` explicitly. |
| `needs_context_rebuild` | When **`true`**, the next send **MUST** rebuild the transcript from the **full** path root → active ([transcript-format.md](transcript-format.md)). |
| `last_seen_at` | Updated when the user loads the tree or applies changes; collaboration / stale UI. |

**Set `needs_context_rebuild = true` when:** the user moves the active node in a way that changes continuation context without sending a message; or a **note** is added, edited, or deleted on any event visible to that user.

**Set `needs_context_rebuild = false` when:** the server accepts a main-thread **`user_input`** for that user in that conversation (after transcript for that send is consumed).

---

## 5. Notes

- Table **`notes`**: **`event_id`** references the **host** message. Notes are **not** tree nodes.
- Transcript serialization: notes follow their host’s message block ([transcript-format.md](transcript-format.md)).
- Ordering: ascending **`created_at`**, tie-break by **`id`**.

---

## 6. Side chat

- **Not** part of the main-thread **`events`** graph. Table **`side_chat_messages`** with monotonic **`seq`** per **`conversation_id`** ([database.md](database.md) §8).
- **`side_chat_messages.kind`** is **separate** from **`events.kind`**. Allowed values for side chat rows are defined in the database **`CHECK`** (e.g. **`user`**, **`system_join`**, **`system_leave`**).
- Optional references: **`referenced_event_id`**, **`referenced_note_id`**, **`referenced_side_chat_message_id`**.
- **Read state:** **`user_side_chat_state.last_read_seq`**.
- **Realtime:** **`GET …/side-chat/stream`** Server-Sent Events ([api-contracts.md](api-contracts.md) §10.6).

---

## 7. Stars

**`event_stars`:** **`(user_id, event_id)`** — per-user bookmark on a main-graph message.

---

## 8. Stale tree (collaboration)

When another member mutates the shared graph and this client’s view may be stale, the client **SHOULD** show a **single** clear refresh prompt rather than silently overwriting local state.

---

## Related docs

- [database.md](database.md) — DDL and columns.
- [data-flow-and-api.md](data-flow-and-api.md) — append order and agent handoff.
- [principles.md](../principles.md) — authoritative transcript vs Cursor-augmented context.
- [tree-ui-contract.md](tree-ui-contract.md) — client tree **presentation** and **selection** vs **actions** (UI-agnostic node state; not a duplicate of graph semantics in this doc).
