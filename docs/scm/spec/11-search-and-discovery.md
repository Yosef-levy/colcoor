# SCM search and discovery

**Structured Conversation Model (SCM) 1.0.0 — normative**

**In-conversation search** across main-thread bodies, display titles, notes, and side channel. Profile **L4**.

Global (cross-conversation) search is **out of scope** for SCM v1.

---

## 1. Scope

| In scope | Out of scope (v1) |
|----------|-------------------|
| Single conversation | All conversations for user |
| Text matching | Semantic / vector search (product extension) |
| Jump to hit | Edit from search results |

---

## 2. Search scopes

Implementations **MUST** support these **scope identifiers** (subset allowed if documented):

| Scope id | Corpus |
|----------|--------|
| `main_bodies` | `content_text` of visible `user_message` and `assistant_message` |
| `message_titles` | `display_title` (and checkpoint label if stored separately) |
| `notes` | `event_notes.content` on visible hosts |
| `side_channel` | Non-deleted `side_channel_messages.body` where `kind = user` |

Default UI **SHOULD** enable all scopes; user **MAY** toggle scopes before search.

---

## 3. Operation

### 3.1 `SearchConversation`

See [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md) §8.1.

**Input:**

| Field | Rules |
|-------|--------|
| `query` | Trimmed; min length **2** recommended; max product-defined |
| `scopes` | Non-empty subset of scope ids |
| `limit` | Default 50; max 200 recommended |

**Output:** ordered array of **hits** (§4).

### 3.2 Implementation profiles

| Profile | Description | L4 conformant |
|---------|-------------|---------------|
| **Client scan** | Load tree + notes + side history (or cache); scan in UI | Yes |
| **Server index** | DB full-text or search engine | Yes |
| **Hybrid** | Server for large convos, client for small | Yes |

Both **MUST** return equivalent hit shapes for the same data.

---

## 4. Hit record shape

Each hit **MUST** include:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | string | yes | `main_body` \| `message_title` \| `note` \| `side_channel` |
| `event_id` | uuid | cond. | Host event for main/note/title |
| `note_id` | uuid | cond. | For `note` hits |
| `side_channel_message_id` | uuid | cond. | For `side_channel` hits |
| `title` | string | yes | Short label for result row |
| `snippet` | string | yes | Context excerpt with match |
| `rank` | number | no | Sort key (lower = better) |

**SHOULD** include `match_offsets` in snippet for highlight rendering.

### 4.1 Title field rules

| Kind | `title` source |
|------|----------------|
| `main_body` | Display title if set, else role + truncated body |
| `message_title` | Display title string |
| `note` | First line of note (collapsed whitespace) |
| `side_channel` | Author display + truncated body |

---

## 5. Matching rules

1. **Case:** case-insensitive for Latin scripts unless locale policy documented.
2. **Normalization:** Unicode NFC recommended; collapse internal whitespace in snippets.
3. **Deleted / invisible:** **MUST NOT** return hits on soft-deleted events, notes on deleted events, or private events of other users.
4. **Ordering:** relevance rank if available, else stable order (e.g. `created_at` desc).

---

## 6. Jump resolver

Activating a hit **MUST** invoke **jump navigation**:

| Kind | Actions |
|------|---------|
| `main_body`, `message_title` | Select `event_id`; expand ancestors; scroll thread |
| `note` | Select host `event_id`; open notes affordance; scroll to note if applicable |
| `side_channel` | Open side panel; scroll to `seq`; optionally select referenced event |

See [07-tree-navigation-contract.md](07-tree-navigation-contract.md) §10.

---

## 7. UI requirements (L4)

Products **SHOULD** provide:

- **Search** drawer or modal scoped to **current conversation**,
- Scope toggles,
- Result list with kind badge,
- Keyboard navigation (up/down, enter to jump),
- Clear empty state when no matches.

---

## 8. Starred and TODO discovery (related)

**Starred list** and **TODO list** are **navigation views**, not full-text search:

| View | Source | Sort |
|------|--------|------|
| Starred | `event_stars` for caller | `created_at` desc recommended |
| TODO | notes matching TODO convention | `created_at` desc |

Both **MUST** support same **jump resolver** as search hits.

---

## 9. Performance

| Conversation size | Recommendation |
|-------------------|----------------|
| &lt; 500 events | Client scan acceptable |
| Large | Server index or incremental index on write |

SCM does not mandate index technology.

---

## 10. Future extensions (informative)

- Regex / filter by author,
- Semantic search over `content_text`,
- Cross-conversation search,
- Search in assembled context preview (debug mode).

---

## Related

- [09-annotations.md](09-annotations.md)
- [12-ui-capability-checklist.md](12-ui-capability-checklist.md)
