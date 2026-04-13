# API contracts — Colcoor extension backend

Normative HTTP API under base path **`/api/v1`**. All JSON bodies use **`Content-Type: application/json`**. Character encoding **UTF-8**. Line endings in text fields are normalized by the server to **Unix `\n`** where relevant.

**Authentication:** every endpoint in §2–§7 except §1 **MUST** reject unauthenticated callers with **401** unless stated otherwise.

**Error envelope (4xx / 5xx):** response body **MUST** be JSON **`{ "detail": string | array }`** (FastAPI-compatible). **`detail`** is a human-readable string, or an array of validation objects for **422** only.

**Success:** response body as specified per route; **204 No Content** where noted means an empty body.

---

## 1. Health (no auth)

| Method | Path | Auth | Success |
|--------|------|------|---------|
| GET | `/health` | none | **200** `{"status":"ok"}` |
| GET | `/ready` | none | **200** `{"status":"ready",...}` or **503** if DB unavailable when configured |
| GET | `/api/v1/health` | none | **200** `{"status":"ok"}` |

---

## 2. Session (auth)

**Only** **`POST /api/v1/auth/cursor`** is defined for obtaining a Colcoor JWT. No other auth login paths are part of this contract.

### 2.1 `POST /api/v1/auth/cursor`

**Purpose:** Exchange a Cursor / VS Code identity-provider access token for a Colcoor API JWT. Provisions or updates **`users`** keyed by **`cursor_sub`** (see [authentication.md](authentication.md)).

| | |
|--|--|
| **Auth** | none |
| **200** | `AuthResponse` |
| **400** | malformed JSON |
| **401** | token could not be verified with any configured verifier |
| **422** | body validation failed |
| **503** | database unavailable |

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `cursor_access_token` | string | yes | min length 1 |
| `provider_hint` | string | no | one of: `auto`, `github`, `microsoft`, `google`; default `auto` |

**Response `AuthResponse`:**

| Field | Type | Required |
|-------|------|----------|
| `access_token` | string | yes |
| `token_type` | string | yes | literal `bearer` |

---

## 3. Conversations

### 3.1 `GET /api/v1/conversations`

**Purpose:** List conversations the caller is a member of. **Order:** caller’s **`pinned`** descending (`true` first), then **`conversations.updated_at`** descending.

| | |
|--|--|
| **Auth** | Bearer JWT |
| **200** | array of `ConversationOut` |
| **401** | missing/invalid token |
| **503** | database not configured |

**Response item `ConversationOut`:**

| Field | Type | Required |
|-------|------|----------|
| `id` | uuid | yes |
| `title` | string \| null | yes |
| `pinned` | boolean | yes | **Per authenticated user** — value read from that user’s `conversation_members.pinned` |
| `updated_at` | string (ISO-8601 timestamptz) | yes |

### 3.2 `POST /api/v1/conversations`

**Purpose:** Create a conversation; caller becomes the sole **owner** member.

| | |
|--|--|
| **Auth** | Bearer JWT |
| **200** | `ConversationOut` |
| **401** | missing/invalid token |
| **402** | quota / plan denies new conversation ([billing-usage.md](billing-usage.md)) |
| **503** | database not configured |

**Request body `ConversationCreate`:**

| Field | Type | Required |
|-------|------|----------|
| `title` | string \| null | no |

### 3.3 `PATCH /api/v1/conversations/{conversation_id}`

**Purpose:** Update shared **title** (owner/editor only) and/or the caller’s **per-user pin** (any member). **[permissions.md](permissions.md)**.

| | |
|--|--|
| **Auth** | Bearer JWT |
| **200** | `ConversationOut` |
| **401** | missing/invalid token |
| **403** | role insufficient for `title` change |
| **404** | conversation not found or not a member |
| **422** | validation error (e.g. empty body) |

**Request body (at least one field must be present in the JSON):**

| Field | Type | Required | Semantics |
|-------|------|----------|-----------|
| `title` | string \| null | no | Omitted = leave unchanged; `null` = clear title |
| `pinned` | boolean | no | Omitted = leave unchanged; updates **only** the caller’s `conversation_members.pinned` |

### 3.4 `DELETE /api/v1/conversations/{conversation_id}`

**Purpose:** Delete conversation and cascaded rows. **Owner only** ([permissions.md](permissions.md)).

| | |
|--|--|
| **Auth** | Bearer JWT |
| **204** | deleted |
| **401** | missing/invalid token |
| **403** | not owner |
| **404** | not found or not a member |

---

## 4. Membership

### 4.1 `GET /api/v1/conversations/{conversation_id}/members`

**Purpose:** List members and roles.

| | |
|--|--|
| **Auth** | Bearer JWT |
| **200** | array of `MemberOut` |
| **401** / **403** / **404** | as above |

**`MemberOut`:**

| Field | Type | Required |
|-------|------|----------|
| `user_id` | uuid | yes |
| `role` | string | yes | `owner` \| `editor` \| `viewer` |
| `email` | string | no | snapshot for UI |
| `display_name` | string | no | snapshot for UI |

### 4.2 `POST /api/v1/conversations/{conversation_id}/members`

**Purpose:** Add a member. **Owner or editor** ([permissions.md](permissions.md) add-member row).

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `user_id` | uuid | yes | must exist in `users` |
| `role` | string | yes | `editor` \| `viewer` only (cannot create second owner via this route) |

| **200** | `MemberOut` |
| **403** | not owner |
| **404** | conversation not found |
| **409** | user already a member |

### 4.3 `PATCH /api/v1/conversations/{conversation_id}/members/{user_id}`

**Purpose:** Change role. **Owner only.** Cannot demote/remove the last owner without transferring ownership (not supported in v1: **403** if operation would leave zero owners).

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| `role` | string | yes | `owner` \| `editor` \| `viewer` |

| **200** | `MemberOut` |
| **403** | not owner or invariant violation |
| **404** | member or conversation not found |

### 4.4 `DELETE /api/v1/conversations/{conversation_id}/members/{user_id}`

**Purpose:** Remove member. **Owner only.** Cannot remove self if sole owner (**403**).

| **204** | removed |

---

## 5. Tree and active cursor

### 5.1 `GET /api/v1/conversations/{conversation_id}/tree`

**Purpose:** Return visible main-thread events for the caller ([domain-model.md](domain-model.md) §3.2).

| | |
|--|--|
| **Auth** | Bearer JWT |
| **200** | `TreeResponse` |
| **401** / **403** / **404** | as above |

**`TreeResponse`:**

| Field | Type | Required |
|-------|------|----------|
| `events` | array of `EventNodeOut` | yes |

**`EventNodeOut`:**

| Field | Type | Required |
|-------|------|----------|
| `id` | uuid | yes |
| `conversation_id` | uuid | yes |
| `parent_event_id` | uuid \| null | yes |
| `kind` | string | yes | `user_input` \| `assistant_output` |
| `actor_type` | string | yes | `user` \| `assistant` |
| `actor_user_id` | uuid \| null | yes |
| `content_text` | string \| null | yes |
| `content_json` | object \| null | no | Structured payload when present (e.g. `colcoor_agent_trace` from Cursor CLI stream-json) |
| `visible_to` | uuid \| null | yes |
| `created_at` | string (ISO-8601) | yes |
| `updated_at` | string (ISO-8601) | yes |
| `starred` | boolean | yes | `true` if the caller has starred this event ([domain-model.md](domain-model.md) §7) |
| `note_count` | integer | yes | Number of notes on this event (≥ 0); [tree-ui-contract.md](tree-ui-contract.md) §7 |

### 5.2 `POST /api/v1/conversations/{conversation_id}/active`

**Purpose:** Set the caller’s **`conversation_user_state`**: active node and optional rebuild flag ([domain-model.md](domain-model.md) §4).

| | |
|--|--|
| **Auth** | Bearer JWT |
| **200** | `ConversationUserStateOut` |
| **401** / **403** / **404** | as above |
| **422** | `active_event_id` not in this conversation or not visible to caller |

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `active_event_id` | uuid | yes | must reference `events.id` in this conversation |
| `needs_context_rebuild` | boolean | no | default `false` when omitted |

**`ConversationUserStateOut`:**

| Field | Type | Required |
|-------|------|----------|
| `conversation_id` | uuid | yes |
| `user_id` | uuid | yes |
| `active_event_id` | uuid | yes |
| `needs_context_rebuild` | boolean | yes |
| `last_seen_at` | string (ISO-8601) | yes |

### 5.3 `GET /api/v1/conversations/{conversation_id}/caller-state`

**Purpose:** Read the caller’s **`conversation_user_state`** (`active_event_id`, `needs_context_rebuild`, `last_seen_at`) without mutating it. If no row exists yet (legacy data), the response is computed as **active = graph root** and **`needs_context_rebuild`: false** (same shape as §5.2 response; not persisted until `POST …/active` or another write creates the row).

| | |
|--|--|
| **Auth** | Bearer JWT |
| **200** | `ConversationUserStateOut` |
| **401** / **403** / **404** | as above |

---

## 6. Main-thread append

### 6.1 `POST /api/v1/conversations/{conversation_id}/append-event`

**Purpose:** Append one **`events`** row. **[domain-model.md](domain-model.md)** §3.1–§3.2; **[permissions.md](permissions.md)**.

| | |
|--|--|
| **Auth** | Bearer JWT |
| **200** | `{"id":"<uuid of new event>"}` |
| **401** | missing/invalid token |
| **403** | forbidden (membership or role) |
| **404** | conversation or parent event not found |
| **422** | validation / parent rules / visibility rules |
| **402** | usage / plan ([billing-usage.md](billing-usage.md)) |

**Request body `AppendEventBody`:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `kind` | string | yes | `user_input` \| `assistant_output` |
| `parent_event_id` | uuid | yes | must exist in same conversation unless product defines bootstrap (root created at conversation create) |
| `content` | string | yes | persisted as `content_text` |
| `author` | string | yes | e.g. `end_user`, `cursor_agent` |
| `private_branch` | boolean | no | default `false`; **only** valid when `kind` is `user_input`; must be `false` when `kind` is `assistant_output` |
| `content_json` | object | no | **Only** when `kind` is `assistant_output`: optional JSON stored on the event (e.g. `{ "colcoor_agent_trace": { "version": 1, "entries": [...] } }` from NDJSON timeline) |

---

## 7. Notes

### 7.1 `GET /api/v1/conversations/{conversation_id}/notes`

**Purpose:** List notes on events visible to the caller in this conversation.

| **200** | array of `NoteOut` |
| **401** / **403** / **404** | standard |

**`NoteOut`:**

| Field | Type | Required |
|-------|------|----------|
| `id` | uuid | yes |
| `event_id` | uuid | yes |
| `author_user_id` | uuid | yes |
| `content` | string | yes |
| `created_at` | string | yes |
| `updated_at` | string | yes |

### 7.2 `POST /api/v1/conversations/{conversation_id}/notes`

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| `event_id` | uuid | yes |
| `content` | string | yes | non-empty after trim |

| **200** | `NoteOut` |
| **403** | viewer role |

### 7.3 `PATCH /api/v1/conversations/{conversation_id}/notes/{note_id}`

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| `content` | string | yes |

| **200** | `NoteOut` |
| **403** | not author and not owner/editor per policy; viewers denied |

### 7.4 `DELETE /api/v1/conversations/{conversation_id}/notes/{note_id}`

| **204** | deleted |
| **403** | same as patch |

---

## 8. Event stars

### 8.1 `PUT /api/v1/conversations/{conversation_id}/events/{event_id}/star`

**Purpose:** Idempotent star for the caller on a visible event.

| **204** | starred |
| **404** | event not in conversation or not visible |

### 8.2 `DELETE /api/v1/conversations/{conversation_id}/events/{event_id}/star`

| **204** | unstarred |

---

## 9. Profile

### 9.1 `PATCH /api/v1/me`

**Purpose:** Update caller profile.

**Request body (at least one field):**

| Field | Type | Required |
|-------|------|----------|
| `display_name` | string | no |
| `avatar_url` | string \| null | no |

| **200** | `MeOut` |

**`MeOut`:**

| Field | Type | Required |
|-------|------|----------|
| `id` | uuid | yes |
| `email` | string | yes |
| `display_name` | string | yes |
| `avatar_url` | string \| null | yes |
| `access_token` | string | no | present only if JWT claims must be refreshed |

---

## 10. Side chat

### 10.1 `GET /api/v1/conversations/{conversation_id}/side-chat/messages`

**Query:** `after_seq` (integer, optional, default `0`). Returns messages with `seq > after_seq`, ascending `seq`.

| **200** | `{ "messages": SideChatMessageOut[] }` |

**`SideChatMessageOut`:**

| Field | Type | Required |
|-------|------|----------|
| `id` | uuid | yes |
| `conversation_id` | uuid | yes |
| `seq` | integer | yes |
| `kind` | string | yes | `user` \| `system_join` \| `system_leave` |
| `author_user_id` | uuid \| null | yes |
| `body` | string \| null | yes |
| `referenced_event_id` | uuid \| null | yes |
| `referenced_note_id` | uuid \| null | yes |
| `referenced_side_chat_message_id` | uuid \| null | yes |
| `created_at` | string | yes |
| `updated_at` | string | yes |
| `edited_at` | string \| null | yes |
| `deleted_at` | string \| null | yes |

### 10.2 `POST /api/v1/conversations/{conversation_id}/side-chat/messages`

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| `kind` | string | yes | `user` for user-authored lines |
| `body` | string | yes | |
| `referenced_event_id` | uuid \| null | no |
| `referenced_note_id` | uuid \| null | no |
| `referenced_side_chat_message_id` | uuid \| null | no |

| **200** | `SideChatMessageOut` |

### 10.3 `PATCH /api/v1/conversations/{conversation_id}/side-chat/messages/{message_id}`

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| `body` | string | yes |

| **200** | `SideChatMessageOut` |
| **403** | not author (except owner moderator override — **403** if not allowed) |

### 10.4 `DELETE /api/v1/conversations/{conversation_id}/side-chat/messages/{message_id}`

Soft delete. **200** `SideChatMessageOut` with `deleted_at` set, or **204** per implementation choice (spec: **200** with updated row).

### 10.5 `PATCH /api/v1/conversations/{conversation_id}/side-chat/read`

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| `last_read_seq` | integer | yes | `>= 0` |

| **204** | read cursor updated |

### 10.6 `GET /api/v1/conversations/{conversation_id}/side-chat/stream`

**Purpose:** **Server-Sent Events** for realtime side-chat and related signals.

| | |
|--|--|
| **Auth** | Bearer JWT (query token **not** allowed; header only) |
| **200** | `Content-Type: text/event-stream` |
| **401** / **403** / **404** | standard |

**Stream format:** each event is one or more **`data:`** lines followed by a blank line. Every payload line **MUST** be a single JSON object (no concatenated objects on one line).

**SSE JSON object (minimum):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | `side_chat` for new/edited side-chat rows; other types may be added for membership/tree with same envelope |
| `message` | object | when `type` is `side_chat` | subset or full `SideChatMessageOut` |

Clients **MUST** ignore unknown `type` values.

---

## Related docs

- [data-flow-and-api.md](data-flow-and-api.md) — main-thread execution order (references this file for payloads).
- [authentication.md](authentication.md) — `cursor_sub` and `/auth/cursor`.
- [permissions.md](permissions.md) — role matrix driving **403** decisions.
- [billing-usage.md](billing-usage.md) — **402** / quota semantics.
