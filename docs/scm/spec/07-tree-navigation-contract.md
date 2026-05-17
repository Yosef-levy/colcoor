# SCM tree navigation contract

**Structured Conversation Model (SCM) 1.0.0 — normative**

UI-agnostic rules for **conversation tree** presentation and interaction. Graph semantics: [03-domain-model.md](03-domain-model.md). Operations: [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md).

**Informative checklist:** [12-ui-capability-checklist.md](12-ui-capability-checklist.md).

---

## 1. Purpose

This document defines:

1. **Node state model** every tree visualization MUST respect.
2. **Allowed on-tree interactions** vs **actions** routed elsewhere.
3. **Metadata** per node.
4. **Layout independence** for future visualizations (graph, timeline, hybrid).

**Out of scope:** specific widget toolkits, CSS, or transport bindings.

---

## 2. Core principles

### 2.1 Separation of concerns

**Tree visualization** is responsible only for:

- Presenting the graph slice the user may see,
- Reflecting **node state** (§4),
- **Selection** (§5.1).

Tree visualization **MUST NOT** own:

- Permission checks,
- Operation implementation,
- Model invocation.

The tree is a **navigation + selection surface**, not an **action surface**.

### 2.2 Authority is graph identity

Logic **MUST NOT** depend on indent depth, row index, or pixel position. Authority is **`event.id`** and **`parent_event_id`** from `GetConversationTree`.

### 2.3 One canonical interaction model

| Interaction | On tree surface |
|-------------|-----------------|
| **Select node** | **Allowed** — primary interaction |
| **Expand / collapse** | **Allowed** — client-only presentation |
| **Other actions** | **Not** as heavy per-row chrome |

Actions use detail bar, context menu, command palette, or shortcuts bound to **current selection**.

---

## 3. Canonical tree data

Build a **forest** from `GetConversationTree` (+ private inclusion policy). Each **node** = one event.

- Parent/child from API fields only.
- Sibling order is a **presentation policy** (default: `created_at` ascending); policies **MUST** be swappable.

---

## 4. Node state model

| State | Meaning |
|-------|---------|
| **`is_selected`** | Current UI selection; drives thread path and detail context |
| **`has_children`** | At least one child in loaded graph |
| **`is_expanded`** | Client-only: children shown in this visualization |
| **`is_private`** | `visible_to` = current user |
| **`has_notes`** | `note_count > 0` |
| **`is_starred`** | Caller has star on event |

**Optional derived:** `note_count`, `role` (`user_message` \| `assistant_message`).

**MUST NOT** conflate `is_selected` with `is_starred` or `is_private`.

**Active anchor:** `active_node_id` from caller state is the continuation default; clients reconcile selection and active anchor on load/send per product rules documented to users.

---

## 5. Interactions vs actions

### 5.1 On tree (inline)

- **Select** node by `id` (single-select unless future spec extends).
- **Expand/collapse** toggles `is_expanded` only.

### 5.2 Off tree (central operation layer)

Examples — each maps to [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md):

- Append user/assistant message (composer; parent = selection or active anchor)
- SetActiveAnchor / “Continue from here”
- CommitPrivateBranch, DeletePrivateDraft
- Note CRUD, StarEvent, SetEventDisplayTitle
- SoftDeleteEventSubtree, RestoreEventSubtree
- Refresh tree (`GetConversationTree`)

Tree code **MAY** emit `selectionChanged(event_id)`; handlers invoke operations.

---

## 6. Central action catalog

Implementations **MUST** define these once (names illustrative):

| Action | Operation |
|--------|-----------|
| Send message | AppendUserMessage + model + AppendAssistantMessage |
| Continue from here | SetActiveAnchor |
| Regenerate | Resend flow ([08-context-assembly.md](08-context-assembly.md) §5) |
| Commit / delete private | CommitPrivateBranch / DeletePrivateDraft |
| Note / star / title | §6 annotations |
| Jump to latest | SetActiveAnchor → default branch tip (product policy) |

New visualizations **MUST** reuse this catalog.

---

## 7. Node metadata (display)

| Metadata | Rule |
|----------|------|
| **Role** | User vs assistant icon/label; user **MAY** show member display name from `actor_user_id` |
| **Private indicator** | When `is_private` |
| **Star** | When `is_starred` |
| **Notes** | Icon and/or `note_count` when `has_notes` |
| **Snippet** | Short excerpt from `content_text` |
| **Display title** | When set; primary line or alongside snippet |
| **Time** | Product formatting; **SHOULD** use relative minutes if &lt; 1 hour else absolute |

Full body remains in **thread** and **detail** panes.

---

## 8. Layout independence

Behavior **MUST** depend only on graph + flags, not layout geometry.

New modes (graph, hybrid, flat timeline) **MUST**:

- Reuse §4 node state,
- Reuse §6 action entry points,
- Not alter graph semantics.

### 8.1 Reference: indented outline

- Vertical list; indent encodes parent/child.
- Expand/collapse per `has_children`.
- **SHOULD** offer horizontal scroll when wider than pane.

### 8.2 Future modes (non-exhaustive)

- Force-directed DAG
- Hybrid minimap + outline
- Timeline with branch markers

Switching mode = **renderer swap**.

---

## 9. Thread pane relationship

**Thread view** shows messages on path **root → selected node** (inclusive). Selection drives path; tree does not duplicate full bodies in rows.

---

## 10. Jump navigation

From search, stars, TODO, or side-channel references, implementations **MUST** provide a **jump resolver** that:

1. Sets selection to target `event_id`,
2. Expands ancestors in tree,
3. Scrolls thread to message,
4. Optionally syncs `SetActiveAnchor`.

See [11-search-and-discovery.md](11-search-and-discovery.md).

---

## Related

- [08-context-assembly.md](08-context-assembly.md)
- [09-annotations.md](09-annotations.md)
- [adoption/02-gap-analysis-branching-vs-navigation.md](../adoption/02-gap-analysis-branching-vs-navigation.md)
