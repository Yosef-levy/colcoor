# Colcoor reference implementation mapping

*Informative — Structured Conversation Model (SCM) 1.0.0*

Maps **SCM** normative concepts to the **Colcoor** open-source reference implementation in this repository. Colcoor is **one** way to implement SCM; it is not the standard itself.

---

## 1. Documentation map

| SCM document | Colcoor `docs/` equivalent |
|--------------|---------------------------|
| [adoption/00-positioning.md](../adoption/00-positioning.md) | *(no direct equivalent — new framing)* |
| [spec/03-domain-model.md](../spec/03-domain-model.md) | [domain-model.md](../../product/domain-model.md) |
| [spec/04-persistence-schema.md](../spec/04-persistence-schema.md) | [database.md](../../product/database.md) |
| [spec/05-operations-and-state-transitions.md](../spec/05-operations-and-state-transitions.md) | [data-flow-and-api.md](../../product/data-flow-and-api.md) + implied routes |
| [spec/06-permissions-and-roles.md](../spec/06-permissions-and-roles.md) | [permissions.md](../../product/permissions.md) |
| [spec/07-tree-navigation-contract.md](../spec/07-tree-navigation-contract.md) | [tree-ui-contract.md](../../product/tree-ui-contract.md) |
| [spec/08-context-assembly.md](../spec/08-context-assembly.md) | [transcript-format.md](../../product/transcript-format.md) + [principles.md](../../principles.md) |
| [spec/09-annotations.md](../spec/09-annotations.md) | [domain-model.md](../../product/domain-model.md) §5,7 + [ui-features.md](../../product/ui-features.md) |
| [spec/10-collaboration.md](../spec/10-collaboration.md) | [domain-model.md](../../product/domain-model.md) §6 + [ui-features.md](../../product/ui-features.md) §10 |
| [spec/11-search-and-discovery.md](../spec/11-search-and-discovery.md) | [ui-features.md](../../product/ui-features.md) §11 (client-side in extension webview) |
| [spec/12-ui-capability-checklist.md](../spec/12-ui-capability-checklist.md) | [ui-features.md](../../product/ui-features.md) |
| [reference/transport-rest-profile.md](transport-rest-profile.md) | [api-contracts.md](../../product/api-contracts.md) |

---

## 2. Terminology

| SCM (normative) | Colcoor (reference) |
|-----------------|---------------------|
| `user_message` | `user_input` |
| `assistant_message` | `assistant_output` |
| `display_title` | `checkpoint_label` column; also `content_json.title` / `message_title` / `display_title` in clients |
| `thread_events` | `events` table |
| `external_subject` | `users.cursor_sub` |
| Side channel | `side_chat_messages` |
| `SetEventDisplayTitle` | `PATCH …/events/{id}` with `checkpoint_label` (route in `conversations.py`) |
| `SearchConversation` | Client-only scan in `conversationWebviewHtml.ts` (no server search route) |

---

## 3. Code locations

| SCM area | Package / path |
|----------|----------------|
| REST API | `packages/backend/colcoor_backend/api/routes/` |
| Graph service | `packages/backend/colcoor_backend/services/graph.py` |
| Side chat | `packages/backend/colcoor_backend/services/side_chat.py` |
| ORM models | `packages/backend/colcoor_backend/db/models.py` |
| Extension entry | `packages/extension/src/extension.ts` |
| API client | `packages/extension/src/api/client.ts` |
| Context / transcript | `packages/extension/src/transcript/buildTranscript.ts` |
| Agent run | `packages/extension/src/agent/agentRunner.ts` |
| Tree webview | `packages/extension/src/conversation/conversationWebviewHtml.ts` |
| Tree panel controller | `packages/extension/src/conversation/conversationPanel.ts` |
| User turn orchestration | `packages/extension/src/conversation/runUserTurn.ts` |

---

## 4. SCM profile coverage (Colcoor snapshot)

| Profile | Colcoor status (approximate) |
|---------|------------------------------|
| **L1** | Implemented (graph, notes, membership) |
| **L2** | Implemented (tree, active anchor, transcript, agent) |
| **L3** | Implemented (side chat SSE, private drafts, members, mentions) |
| **L4** | Implemented (stars, TODO drawer, titles, client search); no server `SearchConversation` |

**Gaps vs optional REST profile:**

- `CommitPrivateBranch` / `DeletePrivateDraft` — check exact route names in `conversations.py`
- Server-side search — not deployed; L4 via client scan
- Billing tables exist; not part of SCM

---

## 5. Auth (product-specific)

Colcoor uses `POST /api/v1/auth/cursor` with Cursor/VS Code IdP tokens ([authentication.md](../../auth/authentication.md)). SCM maps this to generic **Authenticate** operation only in the REST profile example.

---

## Related

- [transport-rest-profile.md](transport-rest-profile.md)
- [conformance-checklist.md](conformance-checklist.md)
- Repository [README.md](../../README.md)
