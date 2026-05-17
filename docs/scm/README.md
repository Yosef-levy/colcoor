# Structured Conversation Model (SCM)

**SCM** is a portable **capability standard** for LLM-facing products: conversation **structure**, **navigation**, **collaboration semantics**, and **context assembly semantics**.

> **Existing LLM UIs already create branches. SCM makes those branches durable, visible, navigable, searchable, referenceable, and collaborative.**

SCM is **not** a product, a transport protocol, or a mandate to replace linear chat. It is the **missing UX/data abstraction layer** between “chat transcript as UI state” and “model invocation.”

---

## What SCM defines (normative, v1)

| Area | Spec document |
|------|----------------|
| Rules and scope | [spec/00-normative-rules.md](spec/00-normative-rules.md) |
| Terminology | [spec/01-glossary.md](spec/01-glossary.md) |
| Design principles | [spec/02-design-principles.md](spec/02-design-principles.md) |
| Graph and collaboration semantics | [spec/03-domain-model.md](spec/03-domain-model.md) |
| Logical persistence profile | [spec/04-persistence-schema.md](spec/04-persistence-schema.md) |
| Operations and state transitions | [spec/05-operations-and-state-transitions.md](spec/05-operations-and-state-transitions.md) |
| Permissions | [spec/06-permissions-and-roles.md](spec/06-permissions-and-roles.md) |
| Tree navigation | [spec/07-tree-navigation-contract.md](spec/07-tree-navigation-contract.md) |
| Context assembly | [spec/08-context-assembly.md](spec/08-context-assembly.md) |
| Annotations | [spec/09-annotations.md](spec/09-annotations.md) |
| Collaboration | [spec/10-collaboration.md](spec/10-collaboration.md) |
| Search | [spec/11-search-and-discovery.md](spec/11-search-and-discovery.md) |
| UI capability checklist (informative) | [spec/12-ui-capability-checklist.md](spec/12-ui-capability-checklist.md) |

**Transport:** SCM v1 conformance is **semantic**. HTTP, GraphQL, local-first sync, CRDT replication, WebSocket, and proprietary transports are all allowed. An optional REST exemplar lives in [reference/transport-rest-profile.md](reference/transport-rest-profile.md).

---

## Adoption (informative)

| Document | Audience |
|----------|----------|
| [adoption/00-positioning.md](adoption/00-positioning.md) | Executives, PM, design — **start here** |
| [adoption/01-executive-summary.md](adoption/01-executive-summary.md) | Decision-makers |
| [adoption/02-gap-analysis-branching-vs-navigation.md](adoption/02-gap-analysis-branching-vs-navigation.md) | Product + engineering leads |
| [adoption/03-integration-with-existing-products.md](adoption/03-integration-with-existing-products.md) | Architects integrating SCM into incumbent UIs |

---

## Reference (informative)

| Document | Purpose |
|----------|---------|
| [reference/transport-rest-profile.md](reference/transport-rest-profile.md) | Optional REST+SSE binding for SCM operations |
| [reference/colcoor-mapping.md](reference/colcoor-mapping.md) | Maps SCM to one open reference implementation |
| [reference/conformance-checklist.md](reference/conformance-checklist.md) | Semantic and optional REST-profile checklists |

---

## Conformance profiles

| Profile | Summary |
|---------|---------|
| **L1 — Graph core** | Durable event graph, visibility, membership read rules |
| **L2 — Navigation** | L1 + active anchor, tree navigation contract, basic context assembly |
| **L3 — Collaboration** | L2 + side channel, private drafts, references, @mentions |
| **L4 — Full surface** | L3 + annotations (stars, titles, TODO convention), in-conversation search |

Details: [reference/conformance-checklist.md](reference/conformance-checklist.md).

---

## Reading order

1. [adoption/00-positioning.md](adoption/00-positioning.md)
2. [spec/03-domain-model.md](spec/03-domain-model.md) + [spec/05-operations-and-state-transitions.md](spec/05-operations-and-state-transitions.md)
3. [spec/07-tree-navigation-contract.md](spec/07-tree-navigation-contract.md) + [spec/08-context-assembly.md](spec/08-context-assembly.md)
4. Remaining `spec/` docs as needed for your profile target
5. [adoption/03-integration-with-existing-products.md](adoption/03-integration-with-existing-products.md) before implementation planning

---

## Version

**SCM 1.0.0** (this folder). Normative documents use RFC 2119 keywords unless marked *informative*.
