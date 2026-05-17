# SCM collaboration

**Structured Conversation Model (SCM) 1.0.0 — normative**

**Shared workspaces**, **private drafts**, **side channel**, **references**, and **@mentions**. Graph rules: [03-domain-model.md](03-domain-model.md). Permissions: [06-permissions-and-roles.md](06-permissions-and-roles.md).

Profile **L3+**.

---

## 1. Shared conversation model

A conversation is a **workspace** shared by **members**. All members see the **shared** subgraph (`visible_to` null) subject to role permissions.

**Solo use** is the degenerate case: one member (owner).

---

## 2. Roles (summary)

| Role | Shared append | Private append | Moderation |
|------|---------------|----------------|------------|
| owner | Yes | Yes | Delete conversation; delete any side message |
| editor | Yes | Yes | Restore subtrees |
| viewer | No | Yes | Own side messages only |

Full matrix: [06-permissions-and-roles.md](06-permissions-and-roles.md).

---

## 3. Private drafts

### 3.1 Purpose

Allow a member to explore branches **without** exposing work-in-progress to the team.

### 3.2 Mechanics

- `AppendUserMessage` with `private=true` sets `visible_to` = caller id.
- Child `assistant_message` events **inherit** private visibility until commit.
- Other members **MUST NOT** see private nodes in `GetConversationTree` default mode.

### 3.3 Commit

`CommitPrivateBranch(anchor)` sets `visible_to = null` for entire private subtree rooted at anchor.

**Requires** owner or editor.

### 3.4 Delete draft

`DeletePrivateDraft` removes private subtree (soft or hard per product policy).

**Requires** owning user (all roles).

### 3.5 UI

**SHOULD** expose:

- **Private mode** toggle on composer,
- **Commit to shared** on private branch,
- **Delete draft**,
- Private indicator on tree nodes ([07-tree-navigation-contract.md](07-tree-navigation-contract.md)).

---

## 4. Side channel

### 4.1 Purpose

**Meta-discussion** parallel to the main dialogue:

- Coordinate without altering model context,
- @mention colleagues,
- Reference specific messages or notes.

### 4.2 Ordering

Monotonic **`seq`** per conversation. Total order **MUST** be preserved under concurrency (server authority recommended).

### 4.3 Message kinds

| Kind | Author | Editable |
|------|--------|----------|
| `user` | Member | Own only |
| `system_join` | Server | No |
| `system_leave` | Server | No |

### 4.4 Read state

Per-user **`last_read_seq`**. Unread count = messages with `seq > last_read_seq` and not deleted.

List conversations **SHOULD** surface unread badge (L3).

### 4.5 Realtime

`SubscribeSideChannelUpdates` **SHOULD** deliver new/edited/deleted messages without full page refresh.

Transport agnostic (SSE, WebSocket, poll).

### 4.6 Soft delete

Deleted messages **MAY** appear as tombstones in history sync for clients that already saw them.

---

## 5. References

### 5.1 Fields

Side message **MAY** include at most one primary reference target:

| Field | Target |
|-------|--------|
| `referenced_event_id` | Main-thread event |
| `referenced_note_id` | Note on an event |
| `referenced_side_channel_message_id` | Prior side message |

### 5.2 UI

**SHOULD** render **reference chips** with resolved labels:

- Event: snippet or display title,
- Note: first-line preview,
- Side: author + snippet.

**SHOULD** support click-to-jump ([07-tree-navigation-contract.md](07-tree-navigation-contract.md) §10).

### 5.3 Composer

**SHOULD** offer “reference selected message” / “reference selected note” when selection exists.

---

## 6. @mentions

### 6.1 Syntax profile (recommended)

- `@handle` — specific member (`users.handle`),
- `@all` — broadcast to all members (product **MAY** restrict to owner).

Matching while composing **SHOULD** consider handle, display name, email local-part.

### 6.2 Completion

Composer **SHOULD** offer picker on `@` with keyboard completion (Enter/Tab).

### 6.3 Notifications

Delivery mechanism is **product-defined** (in-app, email, push). SCM **SHOULD** classify:

- **Mention** — token resolves to recipient,
- **Broadcast** — `@all`,
- **Generic** — other side traffic.

Sounds/desktop notifications **MAY** differ for mention vs generic (informative UX).

### 6.4 Main thread

@mentions in **side channel only** for L3. Main-thread @ in model context is **out of scope**.

---

## 7. Actor attribution

`user_message` events **SHOULD** set `actor_user_id` to authoring member.

Tree **MAY** show “User (Display Name)” using membership directory ([07-tree-navigation-contract.md](07-tree-navigation-contract.md) §7).

---

## 8. Presence and stale graph

### 8.1 Presence (optional)

**MAY** show other members “viewing” conversation based on `last_seen_at` heartbeat.

### 8.2 Stale graph

When shared graph changes since client’s last `GetConversationTree`, client **SHOULD**:

1. Show **one** non-blocking refresh prompt,
2. Avoid silent overwrite of selection without user consent.

---

## 9. Invite flow

1. `SearchInviteCandidates(query)`
2. `AddMember(user_id, role)`
3. Optional `system_join` side message

Invite search **MUST NOT** leak non-member PII beyond what product policy allows.

---

## 10. Collaboration anti-patterns

| Anti-pattern | SCM alternative |
|--------------|-----------------|
| Pasting full thread into side chat | Reference event |
| Private experiments in shared messages | Private draft subgraph |
| Editing old shared message in place | New branch node |
| Team debate in main thread | Side channel |

---

## Related

- [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md) §7
- [11-search-and-discovery.md](11-search-and-discovery.md)
- [adoption/03-integration-with-existing-products.md](../adoption/03-integration-with-existing-products.md)
