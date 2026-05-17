# SCM executive summary

*Informative — Structured Conversation Model (SCM) 1.0.0*

See [00-positioning.md](00-positioning.md) for the strategic frame.

---

## Problem

Teams and power users hit a ceiling in linear chat UIs: **exploration creates branches**, but **products do not expose branches as first-class objects**. Recovery, comparison, handoff, and audit suffer. Collaboration devolves into copying chunks into the main thread or external docs.

---

## Solution

Adopt the **Structured Conversation Model (SCM)** as a **capability standard** inside your product:

- Persist a **directed graph** of user and assistant messages (not only a list).
- Expose **tree navigation** and an **active continuation anchor**.
- Add **annotations** (notes, stars, titles, TODO lists) and **in-conversation search**.
- Support **shared conversations** with **private drafts** and a **side channel** for meta discussion.

> Existing LLM UIs already create branches. SCM makes those branches **durable, visible, navigable, searchable, referenceable, and collaborative**.

---

## Business outcomes

| Outcome | Mechanism |
|---------|-----------|
| **Faster recovery** | Jump to starred messages, TODO notes, or search hits; resume from any node. |
| **Safer exploration** | Parallel branches without losing the map; compare assistant siblings. |
| **Better handoffs** | Shared graph + side channel; references to specific messages/notes. |
| **Clearer audit** | Stable event IDs, soft-delete with restore, optional display titles on nodes. |
| **Lower main-thread noise** | Collaboration and @mentions in side channel, not in model context. |

---

## What you keep

- Existing **model routing**, **tools**, **attachments**, and **RAG**.
- Familiar **linear thread** as one view of the path root → selection.
- Your **auth**, **billing**, and **host platform** choices.

SCM adds a **structure layer**; it does not replace your execution stack.

---

## Conformance profiles

Implement incrementally:

| Profile | Delivers |
|---------|----------|
| **L1** | Durable graph, visibility, membership |
| **L2** | + Tree navigation, active anchor, context assembly |
| **L3** | + Side channel, private drafts, sharing, mentions |
| **L4** | + Stars, titles, TODO convention, scoped search |

Checklist: [reference/conformance-checklist.md](../reference/conformance-checklist.md).

**Not required in v1:** REST API parity, specific UI layout, or any particular vendor stack.

---

## Investment shape

Typical workstreams:

1. **Data model** — graph tables or equivalent in your store ([spec/04-persistence-schema.md](../spec/04-persistence-schema.md)).
2. **Operations layer** — semantic mutations ([spec/05-operations-and-state-transitions.md](../spec/05-operations-and-state-transitions.md)).
3. **Navigation UI** — tree or equivalent ([spec/07-tree-navigation-contract.md](../spec/07-tree-navigation-contract.md)).
4. **Orchestrator** — context assembly before model calls ([spec/08-context-assembly.md](../spec/08-context-assembly.md)).
5. **Collaboration** (L3+) — side channel, roles ([spec/10-collaboration.md](../spec/10-collaboration.md)).

Transport binding (REST or other) can follow your existing API strategy; see [reference/transport-rest-profile.md](../reference/transport-rest-profile.md) only if useful.

---

## Risk posture

| Risk | Mitigation |
|------|------------|
| “Second product inside the product” | SCM complements linear UI; see [03-integration-with-existing-products.md](03-integration-with-existing-products.md). |
| API churn | v1 is transport-agnostic; bind operations to your stack. |
| Scope creep | Profile gates (L1–L4); tool rows and billing stay out of SCM core. |

---

## Next steps

1. Read [02-gap-analysis-branching-vs-navigation.md](02-gap-analysis-branching-vs-navigation.md) with product and design.
2. Map incumbent concepts in [03-integration-with-existing-products.md](03-integration-with-existing-products.md).
3. Target a conformance profile; run [reference/conformance-checklist.md](../reference/conformance-checklist.md).
