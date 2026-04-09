# UI features — Colcoor Cursor extension

This document lists **user-visible** capabilities the extension should provide, aligned with the web app where noted. It does **not** prescribe implementation (webview vs native views, exact VS Code APIs, etc.).

**Out of scope for this feature set:** web search, code execution, and **any** thread UI for historical **tool / assistant-step** rows (no reliance on stored tool graphs in the thread path).

Default UX remains: select node → run → see result; users do not see raw transcript assembly or prompt plumbing ([principles.md](principles.md)).

---

## 1. Account entry, settings, and refresh

### 1.1 Settings (narrow scope)

A **Settings** surface includes **only**:

- **Side chat notification sounds** — e.g. toggle sound on new activity; optional distinct sound when the user is **@mentioned**.
- **Display name** — how the user appears to collaborators in **side chat** (saved via backend profile).
- **Avatar** — **new** for the extension product: user can set or choose an **avatar** shown with their identity in side chat and account UI (exact mechanism—upload, preset picker, or sync from Cursor—is implementation-defined; backend must persist what the product needs).

Theme / editor chrome follows **Cursor**; a separate “dark mode” toggle like the web app is **not** required if the IDE already controls appearance.

### 1.2 Refresh conversations

From the account / menu area, **Refresh conversations** reloads the conversation list from the server (same intent as the web user menu).

### 1.3 Not in scope for this section

Full legal/footer chrome of the web app is optional in the extension; link out or embed policy pages as product policy requires.

---

## 2. About (help)

An **About** (or **Help**) entry opens content that explains **Colcoor in user terms**: long-running, branching conversations with the user in control of where the dialogue continues; notes and collaboration without expecting users to understand transcripts, agents, or backend orchestration. **No** implementation or architecture detail in this copy.

---

## 3. Account management and paywall

- **Account management** — surface where the signed-in user sees **plan / usage / billing-relevant** information consistent with [monetization.md](monetization.md) (wording is user-facing, not API-level).
- **Paywall / upgrade** — when the backend denies an action for plan reasons, show a clear **modal or panel**: short title, explanation, and **upgrade** path when the product offers one.

---

## 4. Conversation list (sidebar)

- **8 — List** conversations with **pinned** items grouped before unpinned; show title and last-updated time.
- **9 — Select** a conversation to load its tree and thread.
- **10 — Per-conversation menu** (e.g. ⋮): **Add editor/viewer**, **Change name** (where role allows), **Pin / Unpin**, **Delete conversation**.
- **11 — Create conversation**: optional title plus **first message** to start a new conversation (same product intent as the web form).

The **conversation list panel** MUST be **minimizable** (collapse to icon or strip) so users can reclaim horizontal space while staying in Colcoor.

---

## 5. Resizable layout

- **13** — Resizable **conversation list** width.
- **14** — Resizable split between **tree** and **message details**.
- **15** — Resizable **composer** height (or equivalent vertical space for the main input).
- **16** — Resizable **side chat** panel width.

Persist sizes where reasonable (e.g. workspace or user settings) so layout feels stable across sessions.

---

## 6. Tree view

- **19** — **Branching graph** of **user** and **assistant** message nodes (compact graph of the canonical message tree).
- **20** — **Active** indicator, **selection** highlight, **private** indicator where private branches exist, **note count** on nodes, snippet or **message title** on the node.
- **21** — **Click** a node to select it and align **thread** + **details** with that selection.
- **22** — **Star** control on nodes (with hover behavior acceptable as “reveal on hover” where it matches desktop patterns).

---

## 7. Thread view (root → active path)

- **23** — Show the **path from root to the active node** (the main narrative thread).
- **24** — Render message bodies with **Markdown** (including tables, task lists, etc., as in GFM-style usage on the web).
- **25** — **Fenced code blocks** with a **copy** control for the code.
- **26** — Respect **text direction** (e.g. RTL) for message content when applicable.
- **27** — Show **notes** attached to a message **inline** under that message, with edit/delete affordances when permitted.
- **28** — While a turn is in progress: show the **pending user line** and **in-flight assistant** content (streaming or updating until the turn completes or is cancelled).
- **29** — **Star** control on thread message blocks.
- **31** — **Copy** full message content (at least where the platform makes sense—e.g. message actions).

**Excluded:** **No** extra rows for **tool calls**, **tool results**, or **assistant steps** in the thread, and **no** dependence on historical tool-graph data in the UI.

---

## 8. Message detail pane

- **33** — **Breadcrumb / path** from root to the **selected** message (including **checkpoint name** in the label when the backend stores one—display only).
- **34** — Full **content** of the selected message.
- **35** — **Continue from here** — set active node to the selection and continue the conversation from that point.
- **36** — **Private branch**: **Commit to shared tree** and **Delete draft** where the product supports private turns and role allows.
- **37** — **Resend** — request another assistant reply from an existing **user** message (new sibling assistant under that user).
- **38** — **Add NOTE** and **Add message title** (modals or inline editors).
- **39** — **NOTES (attached)** with list, **edit/delete** per note, and optional **reference in side chat** from a note’s menu.
- **40** — **Rebuild / context** cues when the tree state implies the next send will rebuild context (same semantics as web `needs_context_rebuild` messaging—user-facing wording only).
- **41** — **Reference in side chat** for the selected **message**; short help that **notes are not separate tree nodes**.

---

## 9. Composer (main thread)

- **44** — Multiline input; **Enter** sends, **Shift+Enter** newline (or platform-idiomatic equivalent).
- **45** — **Send** with clear disabled state and messaging while a reply is in progress.
- **46** — **Private (draft)** mode toggle with **short help** explaining drafts vs shared tree.
- **47** — **Stop** — cancel an in-flight main-thread generation (extension maps this to agent/CLI cancellation policy in [data-flow-and-api.md](data-flow-and-api.md)).

---

## 10. Side chat

- **48** — Open/close **side chat**; **unread** indicator; **dock** or attach panel; **resizable** width (see §5).
- **49** — **Message list**, **send**, **edit**, **delete** (per permissions).
- **50** — **@mentions** with completion and **notifications** (aligned with sound settings in §1).
- **51** — **Reference** main-thread **message** or **note** so the next side-chat post carries that context (pending attachment UX).
- **52** — **Realtime updates** for side chat (e.g. SSE) so the thread stays current without manual refresh.

---

## 11. Drawers and collaboration signals

- **53** — **Starred messages** drawer: list starred items for the current conversation; **jump** to a message.
- **54** — **TODO notes** drawer: list notes whose text starts with **TODO** (case-insensitive); **jump** to the host message.
- **55** — **Presence**: show **other users** currently active on this conversation (exclude self), when collaboration is enabled.
- **56** — When the **shared tree** changes and the client was **stale**, show a **clear prompt** to refresh (same intent as “conversation updated by another user” on the web).

---

## 12. Membership and conversation metadata

- **57** — **Add editor/viewer** flow (email + role); **owner** can **manage members** (list, roles) in the same product area.
- **58** — **Rename conversation** (title) where role allows.

---

## Traceability (selection matrix)

| Web-inventory ref | In extension spec |
|-------------------|-------------------|
| 2–3 (narrowed) | §1 |
| 4 | §2 |
| 5–6 | §3 |
| 8–11 + minimize | §4 |
| 13–16 | §5 |
| 19–22 | §6 |
| 23–29, 31 (not 30) | §7 |
| 33–41 | §8 |
| 44–47 | §9 |
| 48–52 | §10 |
| 53–56 | §11 |
| 57–58 | §12 |

**Avatar** is **§1.1** (new). **30** (tool/step rows) is **explicitly excluded** in §7.
