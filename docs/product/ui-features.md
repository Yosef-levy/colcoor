# UI features — Colcoor Cursor extension

**User-visible** capabilities the extension should provide. Does not prescribe implementation (webview vs native UI, exact VS Code APIs).

**Out of scope for this spec:** server-driven **web search** and **code execution** on the main thread; **any** thread UI rows for **tool calls**, **tool results**, or **assistant steps** (no tool graph in the thread path).

Default UX: select node → run → see result; no raw transcript or prompt plumbing in default UI ([principles.md](../principles.md)).

---

## 1. Account entry, settings, and refresh

### 1.1 Settings (narrow scope)

- **Side chat notification sounds** — toggles for **desktop notifications** and **sounds** (general traffic and **@mentions** separately where offered), plus **volume** for sounds — product-defined granularity in settings.
- **Display name** — how the user appears in **side chat** (persisted on the backend).
- **Avatar** — user-set or chosen **avatar** for side chat and account UI (backend persists URL or asset reference; source is product-defined).

**Theme** follows **Cursor**; a separate global dark/light toggle is optional if the IDE already controls it.

### 1.2 Refresh conversations

Menu action to **reload** the conversation list from the Colcoor backend.

### 1.3 Legal / policy

Link or embed **Terms**, **Privacy**, **Refund** as product policy requires.

### 1.4 Session expiry (HTTP 401)

When the Colcoor API rejects the stored JWT (**HTTP 401** — invalid or expired token), the extension **clears the local Colcoor session** so the user can **Sign in** again without manually signing out first. User-facing messaging still invites sign-in. See [authentication.md](../auth/authentication.md).

---

## 2. About (help)

**About** / **Help** explains **Colcoor** in plain language: branching conversations, control over where the dialogue continues, notes and collaboration — **no** engineering or implementation jargon.

---

## 3. Account management and paywall

- **Account management** — plan, usage, and billing-related information ([monetization.md](../auth/monetization.md)).
- **Paywall / upgrade** — clear modal when the server denies an action: title, message, upgrade action when offered.

---

## 4. Conversation list (sidebar)

- List conversations: **per-user pinned** rows first, then unpinned, each group by **recency** (`updated_at`); show **title** and **last updated**.
- **Select** a conversation to load tree and thread.
- **Per-conversation menu** (e.g. ⋮): **Add editor/viewer**, **Change name** (where role allows), **Pin / Unpin**, **Delete conversation**.
- **Create conversation:** optional title; optional **first message** in a single-line prompt — leave empty, confirm with Enter, or Esc to create with title only (no agent run until you send from the thread).

The list panel MUST be **minimizable** (collapse to strip or icon).

---

## 5. Resizable layout

- Conversation **list** width.
- **Conversation tree** pane vs **thread / composer** (and optional detail) pane widths — layout is independent of tree **semantics**; see [tree-ui-contract.md](tree-ui-contract.md) §8–§9.
- **Composer** height (or equivalent).
- **Side chat** panel width.

Persist sizes where reasonable (workspace or user storage).

---

## 6. Tree view

Normative **state model, interactions, metadata, and layout independence:** **[tree-ui-contract.md](tree-ui-contract.md)**.

**User expectations (summary):**

- **Indented outline** (vertical list, parent/child via indentation) is the **reference** visualization; **expand/collapse** per node that has children.
- **Select** a node as the primary on-tree action; selection drives **thread** and **detail bar** path.
- **Jump to latest** on the default branch — detail bar action; Command Palette **Colcoor: Jump to latest in conversation** when the conversation panel is open.
- **Horizontal scroll** — when indentation or labels make the tree wider than the pane, the tree column scrolls horizontally so deep branches remain reachable ([tree-ui-contract.md](tree-ui-contract.md) §9).
- Nodes show **role** (user vs assistant), **private** when applicable, **star** and **notes** when applicable, compact **snippet** (and **title** when the product exposes one), and **time** per [tree-ui-contract.md](tree-ui-contract.md) §7.
- For **user** messages, the role line **may** include a **member display label** (e.g. `User (Jane Doe)`) when **`actor_user_id`** can be matched to **conversation members** (display name, else `@handle`, else email) — same source as side-chat @-mention metadata ([tree-ui-contract.md](tree-ui-contract.md) §7).
- **Star, notes, private commit/delete, resend**, etc. are **not** required as heavy inline controls on each row; they surface via **detail bar**, **context menu**, **command palette**, or shortcuts ([tree-ui-contract.md](tree-ui-contract.md) §5–§6).

**Future:** other layouts (e.g. graph) MUST reuse the same contract ([tree-ui-contract.md](tree-ui-contract.md) §10).

---

## 7. Thread view (root → active path)

- Path **root → active**.
- **Markdown** rendering — **GitHub Flavored Markdown** (tables, task lists, strikethrough, task checkboxes, bare-URL autolinks, etc.) via a normal markdown pipeline in the extension.
- **LaTeX math** — inline `\(...\)` and block `\[...\]` delimiters (including common **double-escaped** backslashes from model output) are rendered to **readable math** (MathML via **Temml** in the shipped extension); fall back to monospace text if a fragment cannot be parsed.
- **Fenced code** with **copy**; **copy** on each message row. After a successful copy, the button **briefly shows a check** (then reverts) so the user gets feedback without a separate toast.
- **RTL** where applicable for message text.
- **Notes** inline under messages with edit/delete when allowed.
- **In-flight turn:** pending user line + updating assistant text until done or cancelled.
- **While the assistant is generating** (after your user line is visible): composer can **queue** the next message so it attaches under that assistant reply when it finishes, or start a **new branch** from the same anchor you replied from (parallel sibling); **shared vs private** follows the composer **Private (draft)** checkbox, same as a normal send.
- **Star** on messages.
- **Copy** message content (same feedback pattern as code blocks where the platform supports it).
- **Optional CLI trace:** assistant messages may include a **collapsible** summary of local agent activity (reads, edits, shell) derived from Cursor CLI **stream-json** output. That block is separate chrome, not part of the message markdown body.

**Excluded:** no dense inline tool-transcript rows in the main message body as the default reading experience.

---

## 8. Message detail pane (detail bar + body)

**Selection vs actions:** the **detail bar** (breadcrumb + actions) is the primary place for actions tied to the **selected** node; the **tree** remains selection-first only ([tree-ui-contract.md](tree-ui-contract.md) §2, §5).

- **Breadcrumb** root → **selected** (include **checkpoint** label in UI if the backend exposes it on the node — display-only).
- Full **message body**.
- **Continue from here** — set active to selection (detail bar button; same action from the Command Palette **Colcoor: Continue from here** when the conversation panel is open).
- **Private branch:** **Commit to shared** and **Delete draft** when supported and role allows.
- **Resend** — new assistant sibling under an existing **user** message (detail bar button; Command Palette **Colcoor: Resend assistant** when the conversation panel is open).
- **Add NOTE** and **Add message title** (modal or inline).
- **NOTES (attached)** with edit/delete and **Reference in side chat** on notes.
- **Reference in side chat** for the selected **message**; short note that **notes are not tree nodes**.

---

## 9. Composer (main thread)

- **Context menu** (right-click): standard text editing actions — **Undo**, **Redo**, **Cut**, **Copy**, **Paste**, **Select all** — where the webview supports them (aligned with typical editor behavior).
- Multiline input; **Enter** send, **Shift+Enter** newline (or idiomatic equivalent).
- **Send** disabled while your first line is still being posted; **Queue after reply** / **New branch** appear while the assistant is generating so you can stage the next send (branch uses the **Private (draft)** checkbox for shared vs private).
- **Enter** during that phase queues after the pending reply (same as **Queue after reply**).
- **Private (draft)** toggle + short help.
- **Stop** — cancel in-flight generation ([data-flow-and-api.md](data-flow-and-api.md) §4).
- **Optional milestone (checkpoint) label** on send — single-line field in the conversation panel composer, and an optional prompt after **Colcoor: Send message…** from the Command Palette; display-only in the detail breadcrumb when set (see §8).

---

## 10. Side chat

- **Composer** input uses the same **context menu** affordances as §9 (right-click cut/copy/paste, etc.) where supported.
- Open/close in the **same conversation tab**: **three columns** (event tree · main thread and composer · side chat), each with a **horizontally resizable** width where the webview supports it; widths persist in workspace state.
- **Unread** badge on the open control.
- **List**, **send**, **edit**, **delete** (per permissions).
- **@mentions** — type `@` in the side-chat composer to pick a **member** or **All** (`@all`, notifies everyone); match on `@handle`, display name, or email local-part; **Enter** / **Tab** completes; chips in the list show a **tooltip** when the token resolves to a member or to broadcast **@all**. **Sounds / desktop notifications** treat `@…` as a mention when it matches **your** profile handle, display name, or email local part, or when the message includes **`@all`** (see §1).
- **Reference** main-thread **message** or **note** for the next post.
- **Realtime** (e.g. SSE) so the thread updates without manual refresh.

---

## 11. Drawers and collaboration

- **Search** drawer — find text in the **current conversation** with **scopes** (main-thread message bodies, **message titles**, **notes**, **side chat**); choose which scopes apply; open a hit to **jump** to that message or note.
- **Starred messages** drawer — jump to message.
- **TODO notes** drawer — notes whose body starts with `TODO` (case-insensitive); jump to host.
- **Presence** — other active users on this conversation (when collaboration is on).
- **Stale tree prompt** — when the shared tree changed and this client was behind, prompt once to refresh.

---

## 12. Membership and conversation metadata

- **Add editor/viewer** (user id, email, `@handle`, or disambiguation when needed); **owner** or **editor** may invite.
- **Rename conversation** where role allows.

---

## Spec section index

| Section | Topic |
|---------|--------|
| §1 | Settings (sounds, name, avatar), refresh, **401** session handling |
| §2 | About |
| §3 | Account + paywall |
| §4 | Conversation list + minimize |
| §5 | Resizers |
| §6 | Tree ([tree-ui-contract.md](tree-ui-contract.md) normative) |
| §7 | Thread (no tool rows) |
| §8 | Detail bar + details pane |
| §9 | Composer |
| §10 | Side chat |
| §11 | Drawers (search, starred, TODO) + presence + stale prompt |
| §12 | Members + rename |

**Avatar:** §1.1. **Tool rows:** excluded in §7. **Tree behavior/state:** [tree-ui-contract.md](tree-ui-contract.md).
