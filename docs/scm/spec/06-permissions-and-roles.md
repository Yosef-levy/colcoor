# SCM permissions and roles

**Structured Conversation Model (SCM) 1.0.0 — normative**

Role matrix for conversation-scoped operations ([05-operations-and-state-transitions.md](05-operations-and-state-transitions.md)). Enforce in a **central authorization layer**, not in tree layout code ([07-tree-navigation-contract.md](07-tree-navigation-contract.md)).

---

## 1. Roles

Stored per `(conversation_id, user_id)` as **`role`**:

| Role | Intent |
|------|--------|
| **owner** | Full control; exactly **one** per conversation |
| **editor** | Shared graph mutation; cannot remove owner or delete conversation |
| **viewer** | Read shared graph; private drafts; stars; side channel send |

---

## 2. Legend

| Symbol | Meaning |
|--------|---------|
| **Allow** | Operation permitted |
| **Deny** | Operation rejected (`Forbidden`) |
| **Own** | Permitted only when caller is resource author (or star row owner) |

---

## 3. Matrix

| Operation | owner | editor | viewer |
|-----------|-------|--------|--------|
| CreateConversation | Allow | N/A | N/A |
| DeleteConversation | Allow | Deny | Deny |
| UpdateConversation (`title`) | Allow | Allow | Deny |
| UpdateConversation (`pinned`, self) | Allow | Allow | Allow |
| AddMember | Allow | Allow | Deny |
| SearchInviteCandidates | Allow | Allow | Deny |
| RemoveMember | Allow | Deny | Deny |
| ChangeMemberRole | Allow | Deny | Deny |
| AppendUserMessage (shared) | Allow | Allow | Deny |
| AppendUserMessage (private) | Allow | Allow | Allow |
| CommitPrivateBranch | Allow | Allow | Deny |
| DeletePrivateDraft | Allow | Allow | Allow |
| SoftDeleteEventSubtree | Allow | Allow | Deny |
| UndoEventSubtreeDelete | Own batch | Own batch | Deny |
| RestoreEventSubtree | Allow | Allow | Deny |
| RestoreConversation | Allow | Allow | Deny |
| CreateNote / UpdateNote / DeleteNote | Allow | Allow | Deny |
| StarEvent / UnstarEvent | Allow | Allow | Allow |
| SetEventDisplayTitle | Allow | Allow | Deny |
| SendSideChannelMessage | Allow | Allow | Allow |
| EditSideChannelMessage | Own | Own | Own |
| DeleteSideChannelMessage | Allow (any) | Own | Own |
| SetActiveAnchor | Allow | Allow | Allow |
| GetConversationTree, ListNotes, ListSideChannelMessages, ListMembers | Allow | Allow | Allow |

---

## 4. Rules

1. **Non-members:** all operations **Deny** (`NotFound` or `Forbidden` — pick one policy and apply consistently).

2. **Visibility:** append, commit, delete draft, notes, and star require target events **visible** to caller per `visible_to` ([03-domain-model.md](03-domain-model.md) §3.3).

3. **Notes:** editor and owner may edit/delete **any** note on a visible event. Viewer **Deny** note mutations.

4. **Side channel edit:** only `author_user_id` may edit user messages. System messages are not user-editable.

5. **Side channel delete:** owner may delete any message; editor/viewer only **Own** user lines.

6. **Stars:** each user manages only their own star rows.

7. **Deleted conversation:** read operations **Deny** or `NotFound` until restore/undo clears conversation `deleted_at`.

---

## 5. Enforcement placement

| Concern | Where |
|---------|--------|
| Single owner invariant | Storage partial unique index + transaction on create/role change |
| Matrix rows | Before each operation in [05-operations-and-state-transitions.md](05-operations-and-state-transitions.md) |
| UI | Disable/hide commands; **must not** rely on UI alone |

---

## Related

- [03-domain-model.md](03-domain-model.md)
- [10-collaboration.md](10-collaboration.md)
