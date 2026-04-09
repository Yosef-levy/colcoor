# Git integration — loose coupling

Conversation structure and Git are **loosely coupled**. Git is **not** used for conversation synchronization.

## Relationship to the tree

- **Not** every tree node maps to a Git branch.
- A **subtree** **may** map to a branch (product-defined workflow).
- **Multiple** nodes **can** share the same branch.

## Subtree metadata (optional)

Per subtree (or per conversation region), the backend **may** store metadata such as:

| Field | Meaning (example) |
|-------|---------------------|
| `repo_id` | Repository identifier |
| `base_branch` | Starting branch |
| `working_branch` | Branch for edits |
| `pr_id` | Pull request reference |

Exact schema and APIs are implementation-defined; this doc only fixes **semantics**: Git augments workflow metadata; it does **not** define the canonical conversation graph.

## Invariants

- The **source of truth** for reasoning structure remains the **event graph** and tree APIs on the Colcoor backend.
- Git operations (checkout, merge, PR) do not replace or silently migrate conversation nodes without explicit product rules.
