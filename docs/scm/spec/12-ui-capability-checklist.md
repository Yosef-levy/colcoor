# SCM UI capability checklist

*Informative — Structured Conversation Model (SCM) 1.0.0*

User-visible capabilities products **SHOULD** implement when targeting conformance profiles. This does **not** prescribe widgets, frameworks, or layouts.

**Normative behavior** is in `spec/` operations and contracts. **Transport** is optional.

---

## How to use

| Column | Meaning |
|--------|---------|
| **ID** | Stable checklist reference |
| **Profile** | Minimum profile (L1–L4) |
| **Normative** | Primary spec section |
| **Operation** | [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md) |

Mark: ✅ implemented · ⬜ planned · N/A not applicable

---

## 1. Account and session

| ID | Capability | Profile | Normative | Operation |
|----|------------|---------|-----------|-----------|
| U-01 | Authenticate user (product-defined) | — | — | — |
| U-02 | Clear session on auth failure | L2+ | 12 (informative) | — |
| U-03 | Edit display name / avatar for collaboration | L3+ | [10](10-collaboration.md) | Profile ops (product) |

---

## 2. Conversation list

| ID | Capability | Profile | Normative | Operation |
|----|------------|---------|-----------|-----------|
| C-01 | List conversations (pinned, recency) | L1+ | [03](03-domain-model.md) | ListConversations |
| C-02 | Create conversation (+ optional title) | L1+ | [03](03-domain-model.md) | CreateConversation |
| C-03 | Pin/unpin per user | L1+ | [03](03-domain-model.md) | UpdateConversation |
| C-04 | Rename conversation title | L1+ | [03](03-domain-model.md) | UpdateConversation |
| C-05 | Delete conversation (owner) | L1+ | [03](03-domain-model.md) | DeleteConversation |
| C-06 | Side-channel unread badge on list row | L3+ | [10](10-collaboration.md) | ListConversations |
| C-07 | Minimize/collapse conversation list panel | L2+ | — | — |

---

## 3. Tree navigation

| ID | Capability | Profile | Normative | Operation |
|----|------------|---------|-----------|-----------|
| T-01 | Show tree (or equivalent branch map) | L2+ | [07](07-tree-navigation-contract.md) | GetConversationTree |
| T-02 | Select node → update thread path | L2+ | [07](07-tree-navigation-contract.md) | — |
| T-03 | Expand/collapse branches | L2+ | [07](07-tree-navigation-contract.md) | — |
| T-04 | Show role, private, star, notes, title, time on row | L2+ | [07](07-tree-navigation-contract.md) | — |
| T-05 | Horizontal scroll for deep trees | L2+ | [07](07-tree-navigation-contract.md) §8.1 | — |
| T-06 | Jump to latest on default branch | L2+ | [07](07-tree-navigation-contract.md) | SetActiveAnchor |
| T-07 | Stale graph refresh prompt | L3+ | [10](10-collaboration.md) | GetConversationTree |
| T-08 | Member name on user messages (multi-user) | L3+ | [10](10-collaboration.md) | ListMembers |

---

## 4. Thread and detail

| ID | Capability | Profile | Normative | Operation |
|----|------------|---------|-----------|-----------|
| R-01 | Thread shows path root → selection | L2+ | [07](07-tree-navigation-contract.md) §9 | — |
| R-02 | Markdown or rich text rendering (product) | L2+ | — | — |
| R-03 | Copy message content | L2+ | — | — |
| R-04 | Breadcrumb root → selection (+ checkpoint/title) | L2+ | [09](09-annotations.md) | — |
| R-05 | Continue from here | L2+ | [07](07-tree-navigation-contract.md) | SetActiveAnchor |
| R-06 | Resend/regenerate assistant | L2+ | [08](08-context-assembly.md) §6 | AppendAssistantMessage |
| R-07 | In-flight user + streaming assistant | L2+ | [08](08-context-assembly.md) | — |
| R-08 | Stop generation | L2+ | [08](08-context-assembly.md) §8 | — |
| R-09 | Notes inline under messages | L1+ | [09](09-annotations.md) | Note ops |
| R-10 | Star on message | L4 | [09](09-annotations.md) | StarEvent |

---

## 5. Composer (main thread)

| ID | Capability | Profile | Normative | Operation |
|----|------------|---------|-----------|-----------|
| M-01 | Multiline input; send shortcut | L2+ | — | — |
| M-02 | Private (draft) toggle + help | L3+ | [10](10-collaboration.md) | AppendUserMessage |
| M-03 | Commit private / delete draft | L3+ | [10](10-collaboration.md) | CommitPrivateBranch |
| M-04 | Queue after reply / parallel branch while generating | L2+ | [08](08-context-assembly.md) §9 | AppendUserMessage |
| M-05 | Optional checkpoint/title on send | L4 | [09](09-annotations.md) | AppendUserMessage |
| M-06 | Add/edit display title on selected message | L4 | [09](09-annotations.md) | SetEventDisplayTitle |

---

## 6. Side channel

| ID | Capability | Profile | Normative | Operation |
|----|------------|---------|-----------|-----------|
| S-01 | Open/close side panel in conversation | L3+ | [10](10-collaboration.md) | — |
| S-02 | List/send/edit/delete per permissions | L3+ | [10](10-collaboration.md) | Side ops |
| S-03 | Realtime updates | L3+ | [10](10-collaboration.md) | SubscribeSideChannelUpdates |
| S-04 | @mention picker and chips | L3+ | [10](10-collaboration.md) | SendSideChannelMessage |
| S-05 | Reference message/note in composer | L3+ | [10](10-collaboration.md) | SendSideChannelMessage |
| S-06 | Read cursor / unread in panel | L3+ | [10](10-collaboration.md) | SetSideChannelReadCursor |
| S-07 | Mention/broadcast notifications (product) | L3+ | [10](10-collaboration.md) | — |

---

## 7. Drawers and lists

| ID | Capability | Profile | Normative | Operation |
|----|------------|---------|-----------|-----------|
| D-01 | In-conversation search + scopes | L4 | [11](11-search-and-discovery.md) | SearchConversation |
| D-02 | Search hit → jump | L4 | [11](11-search-and-discovery.md) | — |
| D-03 | Starred messages list → jump | L4 | [09](09-annotations.md) | — |
| D-04 | TODO notes list → jump | L4 | [09](09-annotations.md) | — |
| D-05 | Combined starred/TODO tabs (optional) | L4 | — | — |

---

## 8. Membership

| ID | Capability | Profile | Normative | Operation |
|----|------------|---------|-----------|-----------|
| B-01 | List members | L3+ | [10](10-collaboration.md) | ListMembers |
| B-02 | Invite search + add member | L3+ | [10](10-collaboration.md) | SearchInviteCandidates, AddMember |
| B-03 | Change role / remove (owner) | L3+ | [06](06-permissions-and-roles.md) | ChangeMemberRole, RemoveMember |

---

## 9. Destructive actions

| ID | Capability | Profile | Normative | Operation |
|----|------------|---------|-----------|-----------|
| X-01 | Soft-delete message subtree | L1+ | [03](03-domain-model.md) | SoftDeleteEventSubtree |
| X-02 | Undo delete (window) | L1+ | [03](03-domain-model.md) | UndoEventSubtreeDelete |
| X-03 | Restore subtree (owner/editor) | L1+ | [03](03-domain-model.md) | RestoreEventSubtree |

---

## 10. Explicit non-requirements (SCM core)

The following are **not** checklist items for SCM conformance:

- Tool-call rows in main thread
- Server-side main-thread streaming API
- Billing / paywall UI
- Model picker
- Global search
- Specific IDE or agent integration

Products **MAY** add these outside SCM profiles.

---

## Profile summary

| Profile | Checklist focus |
|---------|-----------------|
| **L1** | C-01–02, R-09, X-01–03, graph ops |
| **L2** | + T-*, R-01–08, M-01, M-04 |
| **L3** | + S-*, B-*, M-02–03, T-07–08 |
| **L4** | + D-*, M-05–06, R-10 |

Formal gates: [reference/conformance-checklist.md](../reference/conformance-checklist.md).
