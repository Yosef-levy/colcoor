# Tree UI contract — Colcoor extension

**Normative** specification for how the **conversation tree** is modeled, rendered, and interacted with in client UIs. **Domain semantics** (parent rules, `visible_to`, stars table): [domain-model.md](domain-model.md), [database.md](database.md). **Permissions for actions:** [permissions.md](permissions.md). **HTTP:** [api-contracts.md](api-contracts.md).

**User-visible feature checklist** (non-normative summary): [ui-features.md](ui-features.md) §6.

---

## 1. Purpose and scope

This document defines:

1. A **UI-agnostic node state model** every tree visualization MUST respect.
2. **Allowed interactions** on the tree surface vs **actions** routed elsewhere.
3. **Metadata** a node may display.
4. **Separation rules** so **future layouts** (graph, hybrid, etc.) reuse the same model **without** duplicating behavior logic.

**Out of scope here:** exact VS Code APIs, CSS class names, webview HTML structure, and server implementation details beyond what the client needs to build the model.

---

## 2. Core principles (all visualization modes MUST follow)

### 2.1 Separation of concerns

- **Tree visualization** is responsible only for: presenting the event graph slice the user is allowed to see, reflecting **node state** (§4), and **selection** (§5.1).
- Tree visualization MUST **NOT** own:
  - **Business rules** (who may append, commit private, delete draft, etc.).
  - **Permission checks** (those live in the client command layer and/or server).
  - **Action implementation** (HTTP calls, agent runs, etc.).

The tree is a **navigation + selection surface**, not an **action surface**.

### 2.2 Minimal coupling to visualization

- Do **not** embed branching, permissions, or send logic inside layout or paint code.
- Do **not** write logic that **depends on** indentation depth, expander widgets, or “row index” as authority: **authority is always `event.id` and graph edges** from the API.
- **Actions** (§6) MUST **NOT** depend on how the tree is drawn (indented list, graph, hybrid).

Visualization **may** depend on node state to show: **selection**, **private** indicator, **star**, **notes** presence/count, **parent relation** (for drawing edges or indent), and **expanded/collapsed** (purely local presentation).

### 2.3 One canonical interaction model

| Interaction | On tree surface |
|-------------|-----------------|
| **Select node** | **Allowed** — primary interaction. Updates thread path, detail bar, and (per product rules) may sync `active_event_id` with the server. |
| **Expand / collapse** | **Allowed** — local presentation only; does not change server state. |
| **All other product actions** | **NOT** as heavy inline chrome on each row. |

Other actions are triggered via:

- **Detail bar** (and related panes),
- **Context menu** (right-click on a node where the platform allows),
- **Command palette**,
- **Keyboard shortcuts** bound to commands that take **the current selection** as context.

---

## 3. Canonical data for the tree (behavioral, not visual)

The client builds a **forest of nodes** from **`GET …/tree`** (and private-draft rules). Each **node** corresponds to one **`events`** row (within scope of the conversation).

- **Parent/child** is defined only by **`parent_event_id`** and **`id`** from the API — not by pixel indent.
- **Ordering** among siblings is a **presentation policy** (e.g. by `created_at`); policies MUST remain swappable per visualization mode.

---

## 4. Node state model (authoritative, UI-agnostic)

Each node in the client model exposes at least the following **booleans or derived flags**. Names are **logical**; implementations may use different field names if the mapping is one-to-one.

| State | Meaning |
|-------|---------|
| **`is_selected`** | The **current UI selection** (which node is highlighted; drives thread path and detail context). **`active_event_id`** on the server ([domain-model.md](domain-model.md) §4) is the continuation anchor; clients reconcile selection and `active_event_id` per load/send rules. **Rendering code** MUST treat **`is_selected`** as the only authority for “selected row,” not indent depth or row index. |
| **`has_children`** | The node has one or more child events in the loaded graph. |
| **`is_expanded`** | **Client-only:** children of this node are **shown** in the current visualization. Does not persist to the server unless the product adds a separate preference store. |
| **`is_private`** | The event is a **private draft** for the current user (`visible_to` set to that user); other members must not see it in shared tree responses ([domain-model.md](domain-model.md) §3.3). |
| **`has_notes`** | At least one **note** exists on this event (notes are not tree nodes — [domain-model.md](domain-model.md) §5). |
| **`is_starred`** | Current user has a row in **`event_stars`** for this **`event_id`** ([domain-model.md](domain-model.md) §7). |

**Optional derived fields** (still UI-agnostic):

- **`note_count`** — non-negative integer; MAY be shown when `has_notes` is true.
- **`role`** — `user_input` \| `assistant_output` (from **`kind`**).

Implementations MUST NOT conflate **`is_selected`** with **`is_starred`** or **`is_private`**.

---

## 5. Allowed interactions vs actions

### 5.1 On the tree (inline)

- **Click / equivalent:** select node (toggle selection to that `id` only; no multi-select unless a future spec adds it).
- **Expand/collapse control:** toggle **`is_expanded`** for that node only.

### 5.2 Not primary inline (MUST use commands, detail bar, or context menu)

Examples (central command layer; **not** duplicated per visualization):

- **Append** main-thread message (send from composer with **`parent_event_id`** = selection or policy default).
- **Branch** — choosing **where** the next message attaches is **selection**, not a separate tree widget.
- **Commit private** / **delete private** draft subtree.
- **Add / delete / edit note** on the selected event.
- **Star / unstar** event.
- **Rename conversation**, **pin**, **resend assistant**, etc.

Tree code **may** emit events such as “selection changed” or “context menu requested for `event_id`”; **command handlers** perform permission checks and API calls.

---

## 6. Central actions catalog (conceptual)

All of the following MUST be defined **once** in the extension command / service layer (names illustrative):

- Append event (user send, assistant result).
- Set selection / sync active node (per [domain-model.md](domain-model.md) §4).
- Commit private branch; delete private draft.
- Note CRUD on host `event_id`.
- Star / unstar.
- Refresh tree; open conversation.

**Rule:** adding a **new visualization mode** MUST **reuse** these actions; it MUST **not** fork append/star/note logic inside the new layout.

---

## 7. Metadata the tree may display per node

Visualizations SHOULD keep rows **compact**; full body lives in **thread** and **detail** areas.

| Metadata | Rule |
|----------|------|
| **Role label / icon** | Distinguish **user** vs **assistant** (from **`kind`**). Icon vs text is a presentation choice. For **`user_input`**, the label **may** append a **member display name** resolved client-side from **conversation members** + **`actor_user_id`** (not returned as a separate field on tree nodes). |
| **Private indicator** | Shown when **`is_private`**. |
| **Star indicator** | Shown when **`is_starred`** (from API field **`starred`** on tree nodes for the current user). |
| **Notes** | If **`has_notes`**, MAY show icon and/or **`note_count`** (from API field **`note_count`** on tree nodes). |
| **Snippet** | Short derived text from **`content_text`** (or policy-defined excerpt). Used when no title or as secondary line. |
| **Event title** | If the product exposes a **display title** for the event (e.g. in metadata / `content_json` / future column), show it **in addition to** snippet policy — **not instead of** all content semantics; full text remains in thread/detail. |
| **Time** | Single line per product formatting: if **`created_at`** is **less than one hour** ago, show relative **minutes** (e.g. “`N` minutes ago”); otherwise show **absolute** time **`hh:mm DD/MM/YYYY`** (locale refinements allowed). Same rule for all visualization modes. |

---

## 8. Layout independence (explicit rule)

- **Behavior and state** (§3–§6) MUST depend only on **API graph + per-user flags**, not on “indent level” or “pixel position.”
- **Any new tree visualization** (graph, timeline, hybrid) MUST:
  - Consume the **same node state model** (§4).
  - Use the **same action entry points** (§6).
  - Not require changes to **permission** or **append** semantics.

Indented list is **one renderer**; it MUST NOT be the implicit owner of business logic.

---

## 9. Indented tree mode (current reference implementation)

The **default** Colcoor extension visualization is an **indented vertical outline**:

- **Vertical list** of nodes; **indentation** encodes **parent/child** for discoverability.
- **Siblings** at the same depth are visible according to **`is_expanded`** on ancestors.
- **Expand/collapse** per node with **`has_children`**.
- When the rendered tree is **wider than the pane** (deep indent, long labels), the pane SHOULD offer **horizontal scrolling** so no node is clipped off-screen.

This mode MUST still comply with §2–§8. **Implementation** details (CSS, webview structure) live outside this document.

---

## 10. Future tree visualizations

**Current:** **Indented tree / outline** (§9).

**Future possibilities** (non-exhaustive):

- **Graph view** — force-directed or layered DAG of the same `events` graph.
- **Hybrid** — e.g. indented primary branch + minimap graph.
- **Flat timeline with branch markers** — same data, different spatial encoding.

**Requirement:** each mode MUST **reuse** §4 **node state**, §5–§6 **interactions/actions**, and §7 **metadata** rules. Switching mode is a **renderer swap**, not a new product semantics.

---

## Related docs

- [ui-features.md](ui-features.md) — user-facing tree/thread summary (references this contract).
- [domain-model.md](domain-model.md) — events, `visible_to`, stars, notes, `active_event_id`.
- [permissions.md](permissions.md) — who may commit/delete private, edit notes, etc.
- [api-contracts.md](api-contracts.md) — tree and append endpoints.
- [principles.md](../principles.md) — transcript authority and Colcoor vs Cursor split.
