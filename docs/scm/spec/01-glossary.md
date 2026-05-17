# SCM glossary

**Structured Conversation Model (SCM) 1.0.0**

Normative terms used across SCM documents. Implementations **MAY** use different internal names if the mapping is one-to-one and documented.

---

## Core

| Term | Definition |
|------|------------|
| **SCM** | Structured Conversation Model — this capability standard. |
| **Conformance profile** | Named subset of SCM requirements (L1–L4). |
| **Semantic conformance** | Implementation satisfies graph, operations, and profile requirements without mandating a specific transport. |
| **Transport profile** | Optional binding of SCM operations to a wire protocol (e.g. REST). |

---

## Structure

| Term | Definition |
|------|------------|
| **Conversation** | Shared workspace containing a main-thread graph, optional side channel, and membership. |
| **Main thread** | The primary dialogue graph shown to users and used for model context assembly; distinct from the side channel. |
| **Event** | A node in the main-thread graph: **`user_message`** or **`assistant_message`**. |
| **Graph** | Directed tree/forest of events per conversation, linked by **`parent_event_id`**. |
| **Root event** | The single event with **`parent_event_id` null** per live conversation graph. |
| **Parent / child** | Graph edge: child’s `parent_event_id` references parent’s `id`. |
| **Sibling** | Events sharing the same `parent_event_id`. |
| **Branch** | A path from root to a node, or a subtree rooted at a node; informal. |
| **Active anchor** (`active_node_id`) | Per-user pointer: default parent for the next main-thread send. |
| **Continuation path** | Ordered sequence of events from **root** to **active anchor** (inclusive) used for reading and context. |
| **Selection** | Current UI-selected event id; drives thread/detail view; reconciled with active anchor per product rules. |

---

## Visibility and lifecycle

| Term | Definition |
|------|------------|
| **Shared event** | `visible_to` is null; all members see it in default tree reads. |
| **Private draft** | Event with `visible_to` set to one member’s user id; hidden from others until committed. |
| **Commit (private branch)** | Operation promoting a private subtree to shared visibility. |
| **Soft delete** | `deleted_at` set; hidden from tree/notes reads; may be undone or restored. |
| **Deletion batch** | Shared `deletion_group_id` for one subtree or conversation delete operation. |
| **Hard delete** | Permanent removal after retention; implementation-defined schedule. |

---

## Annotations

| Term | Definition |
|------|------------|
| **Note** | Text attached to a host **event**; not a graph node. |
| **Star** | Per-user bookmark on an event. |
| **Display title** | Short human label on an event for tree/search/breadcrumb; distinct from conversation title. |
| **Checkpoint label** | Optional display-only milestone label (may coincide with display title storage). |
| **TODO note** | Note whose first line matches the TODO convention ([09-annotations.md](09-annotations.md)). |

---

## Collaboration

| Term | Definition |
|------|------------|
| **Member** | User with a row in **conversation membership**. |
| **Role** | `owner`, `editor`, or `viewer` for a member. |
| **Side channel** | Ordered meta-discussion stream parallel to the main graph. |
| **Side channel message** | Row in the side channel with monotonic **seq**. |
| **Reference** | Pointer from a side message to an event, note, or prior side message. |
| **Mention** | @-token in side channel text resolving to a member or broadcast. |
| **Read cursor** | Per-user `last_read_seq` in the side channel. |
| **Stale graph** | Client view may be outdated after another member’s graph mutation. |

---

## Context and execution

| Term | Definition |
|------|------------|
| **Context assembly** | Deterministic construction of model input from path, notes, and new user text. |
| **Assembled context** | Text or structured payload passed to the model orchestrator. |
| **needs_context_rebuild** | Per-user flag: next send must rebuild full path context. |
| **Regenerate / resend** | New **assistant_message** sibling under existing **user_message** without new user node. |
| **Augmented context** | Product-added retrieval, tools, or files outside SCM path rules. |

---

## Search

| Term | Definition |
|------|------------|
| **Search scope** | Corpus slice: main bodies, display titles, notes, side channel. |
| **Hit** | Search result with kind, target ids, snippet, optional offsets. |
| **Jump target** | Navigation resolver: select event, expand ancestors, scroll thread, open side panel. |

---

## Operations

| Term | Definition |
|------|------------|
| **Operation** | Named semantic mutation (e.g. `AppendUserMessage`) in [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md). |
| **Observable state** | Graph slice and flags a client can reconstruct after operations. |

---

## Kind enums (main thread)

| Kind | Meaning |
|------|---------|
| **`user_message`** | Human-authored main-thread turn. |
| **`assistant_message`** | Model-authored main-thread turn. |

---

## Kind enums (side channel — examples)

| Kind | Meaning |
|------|---------|
| **`user`** | Human-authored side message. |
| **`system_join`** | Member joined (server-generated). |
| **`system_leave`** | Member left (server-generated). |

Additional kinds **MAY** be added if documented; they **MUST NOT** appear in the main-thread graph.
