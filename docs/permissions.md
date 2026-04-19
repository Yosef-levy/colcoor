# Permissions — Colcoor extension backend

Normative **role matrix** for conversation-scoped actions. Roles are stored per `(conversation_id, user_id)` in `**conversation_members.role`**: exactly one `**owner`** per conversation (see [database.md](database.md) and [domain-model.md](domain-model.md)).

The extension SHOULD enforce these rules in **central command handlers**, not in tree **layout** code ([tree-ui-contract.md](tree-ui-contract.md) §2, §6).

**Legend**


| Symbol    | Meaning                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------- |
| **Allow** | Action permitted                                                                                        |
| **Deny**  | Action rejected (**403**)                                                                               |
| **Own**   | Permitted only when the resource’s `**author_user_id`** (or star row’s `**user_id`**) equals the caller |


---

## Matrix


| Action                                                    | owner                 | editor | viewer |
| --------------------------------------------------------- | --------------------- | ------ | ------ |
| Create conversation (new top-level conversation)          | Allow                 | N/A    | N/A    |
| Delete conversation (owner soft-delete; undo / restore)   | Allow                 | Deny   | Deny   |
| Rename conversation (`PATCH` title)                       | Allow                 | Allow  | Deny   |
| Pin / unpin (updates caller’s `conversation_members.pinned` only) | Allow | Allow | Allow |
| Add member                                                | Allow                 | Allow  | Deny   |
| Search users to invite (`GET …/member-invite-search`)     | Allow                 | Allow  | Deny   |
| Remove member                                             | Allow                 | Deny   | Deny   |
| Change member role                                        | Allow                 | Deny   | Deny   |
| Append **shared** graph event (`visible_to` null)         | Allow                 | Allow  | Deny   |
| Append **private** graph event (`visible_to` = self)      | Allow                 | Allow  | Allow  |
| Commit private branch (promote private subtree to shared) | Allow                 | Allow  | Deny   |
| Delete private draft subtree                              | Allow                 | Allow  | Allow  |
| Soft-delete main-thread subtree (`DELETE …/events/{id}`)   | Allow                 | Allow  | Deny   |
| Undo own recent subtree delete (`POST …/events/undo-delete`) | Own batch only      | Own batch only | Deny |
| Restore soft-deleted subtree (`POST …/events/{id}/restore-subtree`) | Allow        | Allow  | Deny   |
| Restore owner-deleted conversation (`POST …/restore-deleted`) | Allow             | Allow  | Deny   |
| Add note on visible event                                 | Allow                 | Allow  | Deny   |
| Edit note                                                 | Allow                 | Allow  | Deny   |
| Delete note                                               | Allow                 | Allow  | Deny   |
| Star / unstar event (graph)                               | Allow                 | Allow  | Allow  |
| Side chat: send `kind=user` message                       | Allow                 | Allow  | Allow  |
| Side chat: edit message                                   | Own                   | Own    | Own    |
| Side chat: delete message                                 | Allow (any in thread) | Own    | Own    |
| Set active node / rebuild flag (`POST …/active`)          | Allow                 | Allow  | Allow  |
| Read tree, notes list, side-chat history, members list    | Allow                 | Allow  | Allow  |


---

## Rules

1. **Membership:** if the user is not in `**conversation_members`** for that conversation, every row above is **Deny** (**404** may be returned instead of **403** to avoid leaking existence — product choice; either is valid if consistent in implementation).
2. **Graph visibility:** **append**, **commit**, **delete draft**, **notes**, and **star** apply only to **events the caller can see** per `**visible_to`** ([domain-model.md](domain-model.md) §3.2). A **403** is returned if the parent anchor or target event is not visible.
3. **Notes edit/delete:** **editor** and **owner** may edit or delete **any** note on an event they can see (not only their own). **viewer** is always **Deny** for note mutations.
4. **Side chat edit:** only the `**author_user_id`** of the message may edit (**Own**). **System** lines (`kind` ≠ `user`) are not user-editable (**Deny** for all except server).
5. **Side chat delete — owner:** may delete any message in that conversation’s side chat (moderation). **editor** / **viewer:** only **Own** user-authored lines.
6. **Star:** each user may star or unstar only their own `**event_stars`** row; **viewer** may still star visible events.
7. **Owner-soft-deleted conversation:** after **`DELETE …/conversations/{id}`** ([api-contracts.md](api-contracts.md) §3.4), tree / notes / side-chat / members **read** routes return **404** for all roles until **`POST …/events/undo-delete`** or **`POST …/restore-deleted`** (or **`POST …/events/{id}/restore-subtree`** on the graph root) clears the delete.

---

## Enforcement


| Concern                                   | Where enforced                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role value (`owner`                       | `editor`                                                                                                                                          |
| At most **one** `owner` per conversation  | **Database** partial unique index on `conversation_members(conversation_id) WHERE role = 'owner'`; **application** must not insert a second owner |
| Exactly **one** owner exists after create | **Application** on `POST /conversations` (transaction: insert conversation + insert caller as `owner`)                                            |
| Matrix above                              | **Application** on each route (authorize before mutation)                                                                                         |


---

## Related docs

- [api-contracts.md](api-contracts.md) — HTTP routes and bodies.
- [domain-model.md](domain-model.md) — tree, `visible_to`, active state.

