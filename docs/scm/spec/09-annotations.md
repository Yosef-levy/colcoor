# SCM annotations

**Structured Conversation Model (SCM) 1.0.0 — normative**

**Notes**, **stars**, **display titles**, **checkpoint labels**, and the **TODO** convention. Annotations attach to the graph but are not main-thread nodes ([03-domain-model.md](03-domain-model.md)).

Operations: [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md). Context: [08-context-assembly.md](08-context-assembly.md).

---

## 1. Notes

### 1.1 Semantics

- A **note** is text bound to **`event_id`** (host message).
- Notes **MUST NOT** appear as children in the tree.
- Multiple notes per event allowed.

### 1.2 Ordering

List and assembly order: ascending **`created_at`**, tie-break **`id`**.

### 1.3 Permissions

Create/edit/delete: **owner** and **editor** on visible hosts. **Viewer:** read only ([06-permissions-and-roles.md](06-permissions-and-roles.md)).

### 1.4 Context assembly

Notes on events along the active path **MUST** be included in assembled context per [08-context-assembly.md](08-context-assembly.md).

### 1.5 Side channel

Notes **MAY** be referenced from side messages ([10-collaboration.md](10-collaboration.md)). Referencing does not duplicate note into main thread.

---

## 2. Stars

### 2.1 Semantics

- **Star** = per-user bookmark on an event (`event_stars`).
- Starring **MUST NOT** change graph topology or model context unless user selects starred node.

### 2.2 Permissions

Any member may star/unstar **visible** events, including **viewer**.

### 2.3 UI

Products **SHOULD** provide a **starred messages** list (drawer or panel) with **jump** to host event ([11-search-and-discovery.md](11-search-and-discovery.md)).

### 2.4 Delete interaction

Soft-delete of host event **MUST** remove stars on that event for all users.

---

## 3. Display titles (message titles)

### 3.1 Purpose

Short human-readable label for an event—distinct from **conversation title** (metadata).

Used in:

- Tree row primary/secondary line,
- Breadcrumb / detail bar,
- Search scope `message_titles`,
- Optional line in assembled context ([08-context-assembly.md](08-context-assembly.md) §7.4).

### 3.2 Storage

**Normative:** column **`display_title`** on `thread_events` ([04-persistence-schema.md](04-persistence-schema.md)).

**MAY** additionally mirror in `content_json` keys (`title`, `message_title`, `display_title`) for legacy imports; canonical source **SHOULD** be `display_title` when present.

### 3.3 Constraints

- Trim whitespace; max length **256** characters (recommended).
- Empty string clears title.
- **Display-only:** title change **MUST NOT** alter `content_text` or model history semantics.

### 3.4 Permissions

Set/clear: **owner** and **editor** via `SetEventDisplayTitle`.

### 3.5 Rebuild flag

Title change **SHOULD** set `needs_context_rebuild = true` for members who see the event if titles are injected into context.

---

## 4. Checkpoint labels

Optional **milestone** label captured at **send** time (e.g. “Before refactor”).

**MAY** share storage with `display_title` or separate field; if separate, same display rules apply.

**MUST** remain display-only (not a separate graph node).

Composer **MAY** offer optional checkpoint field on `AppendUserMessage`.

---

## 5. TODO convention

### 5.1 Definition

A note is a **TODO note** when its **first line**, after trim, matches case-insensitively:

```regex
^TODO(\b|:)
```

Examples: `TODO`, `TODO: fix auth`, `todo refactor`.

### 5.2 TODO list

The **TODO list** is a **view** over notes—**not** a separate table.

**SHOULD** sort by `created_at` descending in UI lists.

### 5.3 Label display

List label **SHOULD** use first line with collapsed whitespace; truncate (~90 chars) with ellipsis if needed.

### 5.4 Visibility

TODO notes on **soft-deleted** or **invisible** events **MUST NOT** appear in TODO list.

### 5.5 Jump

Selecting a TODO **MUST** jump to host event ([07-tree-navigation-contract.md](07-tree-navigation-contract.md) §10).

### 5.6 Search

TODO notes **MUST** be findable via `notes` search scope ([11-search-and-discovery.md](11-search-and-discovery.md)).

---

## 6. Combined lists UI (informative)

Products **MAY** combine **Starred** and **TODO** tabs in one drawer; SCM does not require separate surfaces.

---

## 7. Annotation vs main-thread content

| Mechanism | Affects model context when on path | Tree node |
|-----------|-----------------------------------|-----------|
| `user_message` / `assistant_message` | Yes | Yes |
| Note | Yes (injected) | No |
| Display title | Optional line only | No (metadata on node) |
| Star | No | No |
| Side channel | No | No |

---

## Related

- [11-search-and-discovery.md](11-search-and-discovery.md)
- [12-ui-capability-checklist.md](12-ui-capability-checklist.md)
