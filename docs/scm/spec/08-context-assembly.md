# SCM context assembly

**Structured Conversation Model (SCM) 1.0.0 — normative**

Rules for constructing **assembled context** — the orchestrator-controlled input to the language model — from the SCM graph. Graph semantics: [03-domain-model.md](03-domain-model.md). Operations: [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md).

---

## 1. Scope

SCM defines **what** must be included in authoritative context and **when** to rebuild. It does **not** define:

- Model API format (Chat Completions, Messages API, etc.),
- Tool invocation protocols,
- Server-side “transcript HTTP” endpoints.

Products **MAY** map assembled context to their native message arrays after building SCM text or structure.

---

## 2. Two layers

### 2.1 SCM-authoritative (required)

**MUST** include:

1. Messages on path **root → active anchor** (inclusive), both kinds,
2. **Notes** on each host along that path, deterministic order,
3. **New user turn** text for the current send (unless resend-only flow).

### 2.2 Augmented (optional)

Retrieval, files, tools, system prompts **MAY** be appended by the product. Augmented content **MUST NOT** substitute for the SCM path without explicit user-facing policy.

---

## 3. Path selection

### 3.1 Default path

Walk from **`active_node_id`** up via `parent_event_id` to root. Reverse to chronological order root → active.

### 3.2 Selection vs active anchor

If UI **selection** differs from **active anchor** during read-only browsing, assembly for **send** uses:

- **Parent for append:** selection or active per product rule (document which),
- **Path for display:** selection,
- **Path for send:** typically **root → parent of new message** or **root → active** per operation design.

**MUST** document behavior when selection ≠ active at send time.

### 3.3 Excluded from path

- Sibling branches not on path,
- Soft-deleted events,
- Private events of other users,
- Side channel messages (never in main-thread assembly).

---

## 4. Rebuild flag

| `needs_context_rebuild` | Behavior |
|-------------------------|----------|
| `false` | Product **MAY** use incremental strategies if provably equivalent to full rebuild |
| `true` | **MUST** rebuild full path from root |

**Set true:** active anchor change without send; note add/edit/delete on visible events ([03-domain-model.md](03-domain-model.md) §4).

**Set false:** successful `AppendUserMessage` for caller.

---

## 5. Main-thread send lifecycle

Order **MUST** be:

1. Resolve parent / visibility / private flag.
2. **`AppendUserMessage`** — persist before model call.
3. **Assemble** context including new user node (or pass user text separately if format requires — but graph **MUST** already contain the node).
4. **Invoke** model.
5. On success or cancel policy: **`AppendAssistantMessage`** ([05-operations-and-state-transitions.md](05-operations-and-state-transitions.md) §9.1).
6. Refresh tree/state.

There is **no** SCM requirement for server-side streaming completion of main thread.

---

## 6. Regenerate / resend

**Do not** call `AppendUserMessage`.

1. Target existing **`user_message`** id.
2. Assemble path **root → that user_message only** — **exclude** assistant siblings and descendants.
3. Invoke model.
4. **`AppendAssistantMessage`** with same parent id → new sibling assistant.

UI label: “Resend” / “Regenerate.”

---

## 7. Text format profile (normative minimal)

Implementations **MAY** use any internal format. For **interchange documentation**, SCM defines a **text profile**:

### 7.1 Structure

1. Conversation **title** line (or literal `Conversation`).
2. Blank line.
3. **Static header** (product-customizable; **SHOULD** state roles of user, assistant, notes).
4. Blank line.
5. **Body:** for each event on path, host block then note blocks.
6. **New user turn** (if not already last node on path).

Use Unix `\n`.

### 7.2 Delimiters (reference profile)

| Role | Open | Close |
|------|------|-------|
| User | `<<<USER>>>` | `<<<END USER>>>` |
| Assistant | `<<<LLM>>>` | `<<<END LLM>>>` |
| Note | `<<<NOTE>>>` | `<<<END NOTE>>>` |

Notes sorted by `created_at`, then `id`, immediately after host.

### 7.3 Escaping

If body contains delimiter literals, escape by inserting space after `<<` per reference rules in product docs.

### 7.4 Display titles

**MAY** emit a single line before host body, e.g. `[Title: …]`, when `display_title` set. **MUST NOT** replace full `content_text` in storage.

---

## 8. Error handling (main thread)

| Situation | Assistant node | Client |
|-----------|----------------|--------|
| Model hard failure | **Do not** append | Show error; retry optional |
| User cancel | **Append partial** if product shows partial text | Align tree with UI |

---

## 9. Queue and parallel branch while generating

Products **MAY** allow:

- **Queue after reply** — next `AppendUserMessage` waits for in-flight assistant sibling under same parent policy,
- **Parallel branch** — new user sibling from same anchor while generating.

Both **MUST** respect graph parent rules; SCM does not mandate UX choice.

---

## 10. Private and shared sends

- **Private** `AppendUserMessage` sets `visible_to`; assembly visible only to owner until commit.
- **Commit** does not retroactively change assembled history for other members’ past runs; it exposes graph to them going forward.

---

## 11. Determinism

Same graph + active anchor + notes + user text **MUST** yield identical assembled SCM portion. Model output **MAY** vary.

---

## Related

- [02-design-principles.md](02-design-principles.md)
- [09-annotations.md](09-annotations.md)
- [reference/colcoor-mapping.md](../reference/colcoor-mapping.md) — reference text profile source
