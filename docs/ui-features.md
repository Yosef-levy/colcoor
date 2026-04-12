# UI features — Colcoor Cursor extension

**User-visible** capabilities the extension should provide. Does not prescribe implementation (webview vs native UI, exact VS Code APIs).

**Out of scope for this spec:** server-driven **web search** and **code execution** on the main thread; **any** thread UI rows for **tool calls**, **tool results**, or **assistant steps** (no tool graph in the thread path).

Default UX: select node → run → see result; no raw transcript or prompt plumbing in default UI ([principles.md](principles.md)).

---

## 1. Account entry, settings, and refresh

### 1.1 Settings (narrow scope)

- **Side chat notification sounds** — toggle for new activity; optional distinct sound for **@mentions**.
- **Display name** — how the user appears in **side chat** (persisted on the backend).
- **Avatar** — user-set or chosen **avatar** for side chat and account UI (backend persists URL or asset reference; source is product-defined).

**Theme** follows **Cursor**; a separate global dark/light toggle is optional if the IDE already controls it.

### 1.2 Refresh conversations

Menu action to **reload** the conversation list from the Colcoor backend.

### 1.3 Legal / policy

Link or embed **Terms**, **Privacy**, **Refund** as product policy requires.

---

## 2. About (help)

**About** / **Help** explains **Colcoor** in plain language: branching conversations, control over where the dialogue continues, notes and collaboration — **no** engineering or implementation jargon.

---

## 3. Account management and paywall

- **Account management** — plan, usage, and billing-related information ([monetization.md](monetization.md)).
- **Paywall / upgrade** — clear modal when the server denies an action: title, message, upgrade action when offered.

---

## 4. Conversation list (sidebar)

- List conversations: **pinned** first, then unpinned; **title** and **last updated**.
- **Select** a conversation to load tree and thread.
- **Per-conversation menu** (e.g. ⋮): **Add editor/viewer**, **Change name** (where role allows), **Pin / Unpin**, **Delete conversation**.
- **Create conversation:** optional title + **first message** to start.

The list panel MUST be **minimizable** (collapse to strip or icon).

---

## 5. Resizable layout

- Conversation **list** width.
- **Tree** vs **message details** split.
- **Composer** height (or equivalent).
- **Side chat** panel width.

Persist sizes where reasonable (workspace or user storage).

---

## 6. Tree view

- **Branching graph** of **user** and **assistant** nodes.
- **Active**, **selected**, **private**, **note count**, snippet or **message title** on nodes.
- **Click** to select; syncs **thread** and **details**.
- **Star** on nodes (hover-reveal acceptable on desktop).

---

## 7. Thread view (root → active path)

- Path **root → active**.
- **Markdown** rendering (GFM-style: tables, task lists, etc.).
- **Fenced code** with **copy**.
- **RTL** where applicable for message text.
- **Notes** inline under messages with edit/delete when allowed.
- **In-flight turn:** pending user line + updating assistant text until done or cancelled.
- **Star** on messages.
- **Copy** message content where the platform supports it.

**Excluded:** no tool/step rows in the thread.

---

## 8. Message detail pane

- **Breadcrumb** root → **selected** (include **checkpoint** label in UI if the backend exposes it on the node — display-only).
- Full **message body**.
- **Continue from here** — set active to selection.
- **Private branch:** **Commit to shared** and **Delete draft** when supported and role allows.
- **Resend** — new assistant sibling under an existing **user** message.
- **Add NOTE** and **Add message title** (modal or inline).
- **NOTES (attached)** with edit/delete and **Reference in side chat** on notes.
- **Context / rebuild** messaging when `needs_context_rebuild` is true ([domain-model.md](domain-model.md) §4) — user-facing wording only.
- **Reference in side chat** for the selected **message**; short note that **notes are not tree nodes**.

---

## 9. Composer (main thread)

- Multiline input; **Enter** send, **Shift+Enter** newline (or idiomatic equivalent).
- **Send** with disabled state and messaging while a reply is in progress.
- **Private (draft)** toggle + short help.
- **Stop** — cancel in-flight generation ([data-flow-and-api.md](data-flow-and-api.md) §4).

---

## 10. Side chat

- Open/close, **unread** badge, **dock**, **resizable** width.
- **List**, **send**, **edit**, **delete** (per permissions).
- **@mentions** and notifications (aligned with §1 sounds).
- **Reference** main-thread **message** or **note** for the next post.
- **Realtime** (e.g. SSE) so the thread updates without manual refresh.

---

## 11. Drawers and collaboration

- **Starred messages** drawer — jump to message.
- **TODO notes** drawer — notes whose body starts with `TODO` (case-insensitive); jump to host.
- **Presence** — other active users on this conversation (when collaboration is on).
- **Stale tree prompt** — when the shared tree changed and this client was behind, prompt once to refresh.

---

## 12. Membership and conversation metadata

- **Add editor/viewer** (email + role); **owner** manages members.
- **Rename conversation** where role allows.

---

## Spec section index

| Section | Topic |
|---------|--------|
| §1 | Settings (sounds, name, avatar), refresh |
| §2 | About |
| §3 | Account + paywall |
| §4 | Conversation list + minimize |
| §5 | Resizers |
| §6 | Tree |
| §7 | Thread (no tool rows) |
| §8 | Details pane |
| §9 | Composer |
| §10 | Side chat |
| §11 | Drawers + presence + stale prompt |
| §12 | Members + rename |

**Avatar:** §1.1. **Tool rows:** excluded in §7.
