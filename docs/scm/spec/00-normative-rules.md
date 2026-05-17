# SCM normative rules

**Structured Conversation Model (SCM) 1.0.0**

This document defines what is **normative** in SCM v1 and how conformance is judged.

---

## 1. Keywords

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in SCM spec documents are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) unless explicitly marked *informative*.

---

## 2. SCM v1 scope (normative)

The following **MUST** be satisfied for **SCM semantic conformance** (see profiles in [reference/conformance-checklist.md](../reference/conformance-checklist.md)):

| Area | Document |
|------|----------|
| Graph structure, visibility, lifecycle | [03-domain-model.md](03-domain-model.md) |
| Logical persistence invariants | [04-persistence-schema.md](04-persistence-schema.md) |
| Operations and state transitions | [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md) |
| Authorization matrix | [06-permissions-and-roles.md](06-permissions-and-roles.md) |
| Tree navigation semantics | [07-tree-navigation-contract.md](07-tree-navigation-contract.md) |
| Context assembly | [08-context-assembly.md](08-context-assembly.md) |
| Annotations | [09-annotations.md](09-annotations.md) |
| Collaboration | [10-collaboration.md](10-collaboration.md) |
| In-conversation search behavior | [11-search-and-discovery.md](11-search-and-discovery.md) |

**Informative** (not required for semantic conformance):

- [adoption/](../adoption/) — positioning and integration guidance
- [12-ui-capability-checklist.md](12-ui-capability-checklist.md) — QA checklist (recommended for product teams)
- [reference/transport-rest-profile.md](../reference/transport-rest-profile.md) — optional REST binding
- [reference/colcoor-mapping.md](../reference/colcoor-mapping.md) — reference implementation map

---

## 3. Transport-agnostic conformance

SCM v1 defines **behavioral semantics** and **observable state**, not a mandatory wire protocol.

- Implementations **MAY** use REST, GraphQL, gRPC, local-first storage, CRDT replication, WebSocket, or proprietary sync.
- Two implementations with **different APIs** **MAY** both be SCM-conformant if they implement the same **operations** ([05-operations-and-state-transitions.md](05-operations-and-state-transitions.md)) and preserve **graph invariants** ([03-domain-model.md](03-domain-model.md)).
- **Interoperability** in v1 is at the **semantic/state** level, not endpoint parity.

Optional **REST transport profile** conformance is separate; see [reference/conformance-checklist.md](../reference/conformance-checklist.md).

---

## 4. UI independence

1. **Authority** for graph structure is **`event.id`** and **`parent_event_id`** (or equivalent), never list index, scroll position, or indent depth.
2. **Tree visualization** is a **navigation** surface; it **MUST NOT** be the sole owner of mutation or permission logic ([07-tree-navigation-contract.md](07-tree-navigation-contract.md)).
3. **Linear thread** views **MAY** render the path root → selected node; they are one **renderer**, not an alternate data model.

---

## 5. Context assembly boundary

1. SCM defines **orchestrator-controlled** context: path root → active node, notes on that path, and the new user turn ([08-context-assembly.md](08-context-assembly.md)).
2. Products **MAY** add **augmented** context (retrieval, tools, files) outside SCM; augmented context **MUST NOT** replace the SCM path without an explicit product policy documented to users.
3. SCM **MUST NOT** require server-side assembly of the full model prompt; assembly **MAY** occur on client or orchestrator.

---

## 6. Out of scope (SCM v1 core)

The following are **not** normative requirements of SCM v1:

- Model selection, inference, streaming transport to the model
- Tool-call rows in the main thread
- Server-driven web search or code execution as SCM operations
- Billing, quotas, and payment (implementations **MAY** add separately)
- Global cross-conversation search
- MCP, cloud agents, or specific IDE integrations

---

## 7. Versioning

- This folder is **SCM 1.0.0**.
- Future minor versions **SHOULD** remain backward-compatible for graph invariants.
- Breaking graph changes require a new major version and a migration story.

Extension points (non-breaking):

- `content_json` on events (product-specific payloads)
- Additional side-channel `kind` values (with documented semantics)
- Optional columns in [04-persistence-schema.md](04-persistence-schema.md) marked OPTIONAL

---

## 8. Conflict resolution

If SCM documents conflict:

1. [00-normative-rules.md](00-normative-rules.md) (this file)
2. [03-domain-model.md](03-domain-model.md)
3. [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md)
4. Other `spec/` files in numeric order
5. Informative `adoption/` and `reference/` docs

---

## 9. Document map

| ID | File |
|----|------|
| — | [01-glossary.md](01-glossary.md) |
| — | [02-design-principles.md](02-design-principles.md) |
| — | [03-domain-model.md](03-domain-model.md) |
| — | [04-persistence-schema.md](04-persistence-schema.md) |
| — | [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md) |
| — | [06-permissions-and-roles.md](06-permissions-and-roles.md) |
| — | [07-tree-navigation-contract.md](07-tree-navigation-contract.md) |
| — | [08-context-assembly.md](08-context-assembly.md) |
| — | [09-annotations.md](09-annotations.md) |
| — | [10-collaboration.md](10-collaboration.md) |
| — | [11-search-and-discovery.md](11-search-and-discovery.md) |
| — | [12-ui-capability-checklist.md](12-ui-capability-checklist.md) |
