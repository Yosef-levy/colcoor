# REST transport profile for SCM

*Informative — Structured Conversation Model (SCM) 1.0.0*

> **This document is not required for SCM semantic conformance.**  
> It maps [spec/05-operations-and-state-transitions.md](../spec/05-operations-and-state-transitions.md) operations to a **reference REST + SSE** binding. Products **MAY** use GraphQL, gRPC, local-first sync, CRDT, or proprietary RPC instead.

---

## 1. Profile metadata

| Field | Value |
|-------|--------|
| Profile name | `scm-rest-v1` |
| Base path | `/api/v1` |
| Encoding | JSON, UTF-8 |
| Auth | `Authorization: Bearer <token>` on all routes except health and session exchange |
| Errors | `{ "detail": string \| array }` (FastAPI-compatible) |
| Line endings in text | Normalized to `\n` on write |

---

## 2. Operation index

| SCM operation | Method | Path |
|---------------|--------|------|
| — (health) | GET | `/health`, `/ready` |
| Authenticate (product) | POST | `/auth/session` *example* |
| CreateConversation | POST | `/conversations` |
| ListConversations | GET | `/conversations` |
| UpdateConversation | PATCH | `/conversations/{id}` |
| DeleteConversation | DELETE | `/conversations/{id}` |
| RestoreConversation | POST | `/conversations/{id}/restore-deleted` |
| ListMembers | GET | `/conversations/{id}/members` |
| SearchInviteCandidates | GET | `/conversations/{id}/member-invite-search?q=` |
| AddMember | POST | `/conversations/{id}/members` |
| ChangeMemberRole | PATCH | `/conversations/{id}/members/{user_id}` |
| RemoveMember | DELETE | `/conversations/{id}/members/{user_id}` |
| GetConversationTree | GET | `/conversations/{id}/tree` |
| GetCallerConversationState | GET | `/conversations/{id}/caller-state` |
| SetActiveAnchor | POST | `/conversations/{id}/active` |
| AppendUserMessage / AppendAssistantMessage | POST | `/conversations/{id}/append-event` |
| SoftDeleteEventSubtree | DELETE | `/conversations/{id}/events/{event_id}` |
| UndoEventSubtreeDelete | POST | `/conversations/{id}/events/undo-delete` |
| RestoreEventSubtree | POST | `/conversations/{id}/events/{event_id}/restore-subtree` |
| SetEventDisplayTitle | PATCH | `/conversations/{id}/events/{event_id}/display-title` *recommended* |
| ListNotes | GET | `/conversations/{id}/notes` |
| CreateNote | POST | `/conversations/{id}/notes` |
| UpdateNote | PATCH | `/conversations/{id}/notes/{note_id}` |
| DeleteNote | DELETE | `/conversations/{id}/notes/{note_id}` |
| StarEvent | PUT | `/conversations/{id}/events/{event_id}/star` |
| UnstarEvent | DELETE | `/conversations/{id}/events/{event_id}/star` |
| ListSideChannelMessages | GET | `/conversations/{id}/side-chat/messages?after_seq=` |
| SendSideChannelMessage | POST | `/conversations/{id}/side-chat/messages` |
| EditSideChannelMessage | PATCH | `/conversations/{id}/side-chat/messages/{msg_id}` |
| DeleteSideChannelMessage | DELETE | `/conversations/{id}/side-chat/messages/{msg_id}` |
| SetSideChannelReadCursor | PATCH | `/conversations/{id}/side-chat/read` |
| SubscribeSideChannelUpdates | GET | `/conversations/{id}/side-chat/stream` (SSE) |
| SearchConversation | *none in core REST* — client scan or `GET …/search?q=` *extension* |
| CommitPrivateBranch | POST | `/conversations/{id}/events/{event_id}/commit-private` *recommended* |
| DeletePrivateDraft | DELETE | `/conversations/{id}/events/{event_id}/private-draft` *recommended* |

*Recommended paths for operations not universally deployed; semantic behavior in [spec/05](../spec/05-operations-and-state-transitions.md) is authoritative.*

---

## 3. Health (no auth)

| Method | Path | Response |
|--------|------|----------|
| GET | `/health` | `200` `{"status":"ok"}` |
| GET | `/ready` | `200` `{"status":"ready","database":"ok"}` or `503` |

---

## 4. Session (product-specific)

SCM does not mandate auth shape. Reference pattern:

### `POST /api/v1/auth/session`

Exchange an external IdP token for an API bearer token.

**Request:** `{ "access_token": string, "provider_hint"?: string }`

**Response:** `{ "access_token": string, "token_type": "bearer" }`

---

## 5. Conversations

### `GET /api/v1/conversations`

**Operation:** `ListConversations`

**Response item:**

| Field | Type |
|-------|------|
| `id` | uuid |
| `title` | string \| null |
| `pinned` | boolean (per caller) |
| `updated_at` | ISO-8601 |
| `side_chat_has_unread` | boolean |
| `side_chat_unread_count` | integer |

### `POST /api/v1/conversations`

**Operation:** `CreateConversation`

**Body:** `{ "title"?: string | null }`

### `PATCH /api/v1/conversations/{conversation_id}`

**Operation:** `UpdateConversation`

**Body:** `{ "title"?: string | null, "pinned"?: boolean }` (at least one field)

### `DELETE /api/v1/conversations/{conversation_id}`

**Operation:** `DeleteConversation` — owner only.

**Response:** `{ "deleted_count": int, "deletion_group_id": uuid | null }`

### `POST /api/v1/conversations/{conversation_id}/restore-deleted`

**Operation:** `RestoreConversation`

**Response:** `{ "restored_count": int }`

---

## 6. Tree and active anchor

### `GET /api/v1/conversations/{conversation_id}/tree`

**Operation:** `GetConversationTree`

**Response:** `{ "events": EventNode[] }`

**EventNode** (SCM mapping):

| Field | SCM |
|-------|-----|
| `kind` | `user_message` → `user_input` alias allowed in legacy APIs |
| `kind` | `assistant_message` → `assistant_output` alias |
| `starred` | caller star state |
| `note_count` | annotation count |
| `display_title` / `checkpoint_label` | [09-annotations](../spec/09-annotations.md) |

### `GET …/caller-state`

**Operation:** `GetCallerConversationState`

### `POST …/active`

**Operation:** `SetActiveAnchor`

**Body:** `{ "active_event_id": uuid, "needs_context_rebuild"?: boolean }`

---

## 7. Append event (main thread)

### `POST /api/v1/conversations/{conversation_id}/append-event`

**Operations:** `AppendUserMessage`, `AppendAssistantMessage`

**Body:**

| Field | Type | Notes |
|-------|------|-------|
| `kind` | string | `user_message` \| `assistant_message` (legacy: `user_input`, `assistant_output`) |
| `parent_event_id` | uuid | required |
| `content` | string | maps to `content_text` |
| `author` | string | e.g. `end_user`, `model` |
| `private_branch` | boolean | only for user kind |
| `content_json` | object | optional extensions |
| `display_title` / `checkpoint_label` | string | optional on create |

**Response:** `{ "id": "<new event uuid>" }`

---

## 8. Notes

| Method | Path | Operation |
|--------|------|-----------|
| GET | `…/notes` | ListNotes |
| POST | `…/notes` | CreateNote — `{ event_id, content }` |
| PATCH | `…/notes/{note_id}` | UpdateNote |
| DELETE | `…/notes/{note_id}` | DeleteNote |

---

## 9. Stars

| Method | Path | Operation |
|--------|------|-----------|
| PUT | `…/events/{event_id}/star` | StarEvent — `204` |
| DELETE | `…/events/{event_id}/star` | UnstarEvent — `204` |

---

## 10. Subtree delete / restore

| Method | Path | Operation |
|--------|------|-----------|
| DELETE | `…/events/{event_id}` | SoftDeleteEventSubtree |
| POST | `…/events/undo-delete` | UndoEventSubtreeDelete — `{ deletion_group_id }` |
| POST | `…/events/{event_id}/restore-subtree` | RestoreEventSubtree |

---

## 11. Display title

### `PATCH /api/v1/conversations/{conversation_id}/events/{event_id}/display-title`

**Operation:** `SetEventDisplayTitle`

**Body:** `{ "display_title": string | null }`

*Legacy implementations may use `checkpoint_label` field name for the same semantics.*

---

## 12. Side channel

### `GET …/side-chat/messages?after_seq=0`

**Operation:** `ListSideChannelMessages`

### `POST …/side-chat/messages`

**Operation:** `SendSideChannelMessage`

### `PATCH …/side-chat/messages/{message_id}`

**Operation:** `EditSideChannelMessage`

### `DELETE …/side-chat/messages/{message_id}`

**Operation:** `DeleteSideChannelMessage`

### `PATCH …/side-chat/read`

**Operation:** `SetSideChannelReadCursor` — `{ "last_read_seq": int }` → `204`

### `GET …/side-chat/stream`

**Operation:** `SubscribeSideChannelUpdates`

**SSE:** `data: { "type": "side_chat", "message": {…} }\n\n`

---

## 13. Optional search extension

Not part of minimal REST profile. Implementations **MAY** add:

### `GET /api/v1/conversations/{conversation_id}/search`

**Query:** `q`, `scopes` (comma-separated)

**Response:** `{ "hits": SearchHit[] }` per [spec/11-search-and-discovery.md](../spec/11-search-and-discovery.md)

Client-only search requires **no** endpoint.

---

## 14. Status code conventions

| Code | Use |
|------|-----|
| 200 | Success with body |
| 204 | Success empty |
| 401 | Unauthenticated |
| 403 | Forbidden (role/visibility) |
| 404 | Not found / not member |
| 409 | Conflict (duplicate member) |
| 422 | Validation / graph rule violation |
| 402 | Quota (product extension, not SCM core) |
| 503 | Dependency unavailable |

---

## 15. REST profile conformance

An implementation **claims `scm-rest-v1` profile** when:

1. It is **SCM semantically conformant** for a declared L1–L4 profile, and
2. It exposes the **core** routes in §2 index (except optional search and private-commit paths, which **MUST** be documented if omitted).

Semantic tests: [conformance-checklist.md](conformance-checklist.md).

---

## Related

- [spec/05-operations-and-state-transitions.md](../spec/05-operations-and-state-transitions.md)
- [colcoor-mapping.md](colcoor-mapping.md)
