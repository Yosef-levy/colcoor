# SCM conformance checklist

*Informative — Structured Conversation Model (SCM) 1.0.0*

Use this checklist to evaluate **semantic conformance** and optional **REST transport profile** conformance.

**Instructions:** For each row, mark **Pass**, **Fail**, **N/A**, or **Partial** with notes.

---

## A. Semantic conformance (SCM 1.0)

Required for claiming **“SCM 1.0 conformant”** at a stated profile (L1–L4).

### A.1 Graph core (L1)

| ID | Requirement | Pass? |
|----|-------------|-------|
| G-01 | Conversations have exactly one root `user_message` with null parent | |
| G-02 | Only `user_message` and `assistant_message` on main thread | |
| G-03 | Assistant parent is always answering `user_message` | |
| G-04 | Regenerate creates assistant sibling, not new user node | |
| G-05 | Shared vs private `visible_to` enforced on reads | |
| G-06 | Soft-delete subtree hides events; root not deletable | |
| G-07 | Undo delete within documented window | |
| G-08 | Notes attach to events; not tree nodes | |
| G-09 | One owner per conversation invariant | |
| G-10 | Edit-message policy preserves navigable graph (document policy) | |

### A.2 Navigation (L2)

| ID | Requirement | Pass? |
|----|-------------|-------|
| N-01 | `GetConversationTree` returns stable ids and parent edges | |
| N-02 | Per-user `active_node_id` (or equivalent) | |
| N-03 | `needs_context_rebuild` honored on send | |
| N-04 | Tree selection uses event id, not row index | |
| N-05 | Thread shows path root → selection | |
| N-06 | `AppendUserMessage` before model invoke | |
| N-07 | Context assembly excludes off-path siblings | |
| N-08 | Resend uses user-only path then new assistant sibling | |

### A.3 Collaboration (L3)

| ID | Requirement | Pass? |
|----|-------------|-------|
| C-01 | Add/remove/change members per role matrix | |
| C-02 | Side channel monotonic `seq` | |
| C-03 | Side channel separate from main append | |
| C-04 | Read cursor / unread semantics | |
| C-05 | Private draft + commit + delete draft | |
| C-06 | References on side messages (≥1 ref type) | |
| C-07 | @mention or documented alternative | |
| C-08 | Stale graph prompt on shared mutation | |

### A.4 Full surface (L4)

| ID | Requirement | Pass? |
|----|-------------|-------|
| F-01 | Star/unstar per user on visible events | |
| F-02 | Set/clear display title on events | |
| F-03 | TODO convention on notes + TODO list view | |
| F-04 | Starred list with jump | |
| F-05 | `SearchConversation` with all four scopes OR client-equivalent scan | |
| F-06 | Search hit jump resolver | |

---

## B. Operation coverage

Verify each [spec/05](../spec/05-operations-and-state-transitions.md) operation exists or documented equivalent:

| Operation | Implemented? | Transport |
|-----------|----------------|-----------|
| CreateConversation | | |
| ListConversations | | |
| UpdateConversation | | |
| DeleteConversation | | |
| GetConversationTree | | |
| GetCallerConversationState | | |
| SetActiveAnchor | | |
| AppendUserMessage | | |
| AppendAssistantMessage | | |
| SoftDeleteEventSubtree | | |
| UndoEventSubtreeDelete | | |
| RestoreEventSubtree | | |
| CommitPrivateBranch | | |
| DeletePrivateDraft | | |
| ListNotes / Create / Update / Delete | | |
| StarEvent / UnstarEvent | | |
| SetEventDisplayTitle | | |
| ListSideChannelMessages | | |
| SendSideChannelMessage | | |
| EditSideChannelMessage | | |
| DeleteSideChannelMessage | | |
| SetSideChannelReadCursor | | |
| SubscribeSideChannelUpdates | | |
| SearchConversation | | |

---

## C. REST profile (`scm-rest-v1`) — optional

Only if claiming **REST profile** in addition to semantic conformance.

| ID | Route / behavior | Pass? |
|----|------------------|-------|
| R-01 | Bearer auth on protected routes | |
| R-02 | `GET/POST/PATCH/DELETE` conversations | |
| R-03 | `GET tree`, `POST active`, `GET caller-state` | |
| R-04 | `POST append-event` | |
| R-05 | Notes CRUD routes | |
| R-06 | Star PUT/DELETE | |
| R-07 | Subtree DELETE + undo + restore | |
| R-08 | Side chat messages + read + SSE stream | |
| R-09 | Error envelope `{ detail }` | |

---

## D. Scenario tests (recommended)

Run manually or automate:

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Create conversation → single root | Tree has one node |
| 2 | Send user + assistant | Child under root |
| 3 | Branch from mid-tree | Two user siblings share parent |
| 4 | Regenerate assistant | Two assistant siblings, one user parent |
| 5 | Select old node, continue | New branch; path assembly correct |
| 6 | Private draft → commit | Other member sees subgraph |
| 7 | Side message with event reference | Chip jumps to event |
| 8 | Star + TODO note | Appear in lists; jump works |
| 9 | Search term in side channel only | Hit with `side_channel` kind |
| 10 | Member A deletes subtree; Member B | Stale prompt or fresh tree |

---

## E. Declaration template

```text
Product: _______________________
SCM version: 1.0.0
Semantic profile: L1 / L2 / L3 / L4
REST profile scm-rest-v1: Yes / No
Edit-message policy: _______________________
Search implementation: Client / Server / Hybrid
Known deviations: _______________________
Date: _______________________
```

---

## Related

- [../README.md](../README.md)
- [transport-rest-profile.md](transport-rest-profile.md)
- [colcoor-mapping.md](colcoor-mapping.md)
