# SCM design principles

**Structured Conversation Model (SCM) 1.0.0**

Normative principles for implementations claiming SCM conformance. On conflict with other spec sections, [00-normative-rules.md](00-normative-rules.md) and [03-domain-model.md](03-domain-model.md) prevail.

---

## 1. Explicit graph memory

Conversation memory **MUST** be stored as an **event graph** with stable identifiers, not only as render order in a UI buffer.

**Rationale:** Implicit lists cannot support durable navigation, collaboration, or audit across sessions.

---

## 2. Branching ≠ navigation (product principle)

Implementations **SHOULD** treat **creating a branch** (edit, regenerate, alternate send) and **navigating branches** (tree, anchor, jump) as separate capabilities. SCM standardizes both; incumbent products often implement only the first.

---

## 3. Authoritative context path

The orchestrator **MUST** construct model input from:

1. The **continuation path** root → active anchor (inclusive),
2. **Notes** on events along that path, injected deterministically,
3. The **new user turn** for the current send (when applicable).

This assembled input is the **SCM-authoritative** portion of model context ([08-context-assembly.md](08-context-assembly.md)).

---

## 4. Augmented context is optional and separate

Products **MAY** attach retrieval, tools, files, or system prompts outside SCM rules. Such **augmented context**:

- **MUST NOT** silently replace the SCM path,
- **SHOULD** be documented so users understand what the model saw,
- **MAY** vary between runs (non-deterministic), unlike the SCM path.

---

## 5. No hidden branch history in SCM context

The assembled context for a send **MUST** include only events and notes on the **selected path** plus the new turn. Sibling branches **MUST NOT** leak into assembly unless the user changes selection or active anchor.

---

## 6. Context assembly location

Assembly **MAY** run on client, edge orchestrator, or server service. SCM **MUST NOT** require a “transcript HTTP API.” Storage holds the **graph**; assembly is a product responsibility.

---

## 7. Tree is navigation; operations are centralized

- Visualizations (tree, timeline, graph, minimap) **MUST** share one **node state model** ([07-tree-navigation-contract.md](07-tree-navigation-contract.md)).
- Mutations **MUST** flow through a single **operation layer** ([05-operations-and-state-transitions.md](05-operations-and-state-transitions.md)), not duplicated per widget.

---

## 8. Side channel isolation

Meta-discussion, @mentions, and references to messages **SHOULD** use the **side channel** when available, so the main thread remains the **model dialogue** rather than a team chat log.

---

## 9. Private drafts before shared commitment

Exploration visible only to one member **MUST** use **private visibility** until an explicit **commit** operation promotes the subtree to shared ([10-collaboration.md](10-collaboration.md)).

---

## 10. Determinism of structure, not of model output

Given the same graph, active anchor, notes, and user text:

- **Structure** and **assembled SCM context** **MUST** be reproducible.
- **Model output** **MAY** vary (temperature, tools, retrieval).

---

## 11. Complement linear UI

A linear thread **MAY** remain the default reading experience. It **MUST** be a **view** over the graph path, not a second source of truth.

---

## 12. User-facing simplicity

Default UX **SHOULD** be: select where to continue → compose → run → see result—without exposing assembly internals ([12-ui-capability-checklist.md](12-ui-capability-checklist.md)). Developer/diagnostic modes **MAY** expose raw context.

---

## 13. Soft delete and recovery

Destructive actions on the graph **SHOULD** use **soft delete** with undo and restore windows where operations define them ([05-operations-and-state-transitions.md](05-operations-and-state-transitions.md)).

---

## 14. Collaboration safety

When the shared graph changes under another member, clients **SHOULD** detect **stale graph** state and prompt refresh rather than silently corrupting local selection ([10-collaboration.md](10-collaboration.md)).

---

## Related

- [03-domain-model.md](03-domain-model.md)
- [08-context-assembly.md](08-context-assembly.md)
- [adoption/00-positioning.md](../adoption/00-positioning.md)
