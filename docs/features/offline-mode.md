# Offline (local) standalone mode

Colcoor can run **fully offline as a single user**, with no Colcoor backend, no sign-in,
and no collaboration. In this mode all conversation data is stored on disk under the
current workspace's `.colcoor/` folder instead of the backend PostgreSQL database.

This is a **runtime setting** on the same extension build — it is not a separate binary.

## Enabling it

1. Open the workspace folder you want to keep conversations in.
2. Set `colcoor.storageMode` to `local`:
   - Settings UI: search "Colcoor storage mode" and choose **local**, or
   - Workspace `.vscode/settings.json`:
     ```json
     { "colcoor.storageMode": "local" }
     ```
3. Reload the window (**Developer: Reload Window**). The storage backend is chosen at
   activation, so a reload is required after changing the setting.

When local mode is active you do **not** need to sign in. The conversations view,
creating conversations, branching, notes, stars, lists, soft-delete / restore, and
running the Cursor agent all work exactly as in remote mode.

## Soft-delete and restore (local)

Local mode mirrors the backend batch semantics:

- **Delete message branch** tombstones the subtree with a shared `deletion_group_id` in
  `events.jsonl`. Immediate **Undo** (and **Restore message branch…**) clear that batch.
- **Delete conversation** tombstones every live event **and** sets `meta.json`
  `deleted_at` / `deletion_group_id` to the same group. The conversation leaves the live
  sidebar list and appears under **Recently Deleted**.
- **Restore deleted conversation…** (Command Palette or the deleted-row context menu)
  restores the shared group so `meta.json` and events become live again.
- Offline local storage does **not** enforce the remote 5-minute undo window or the
  14-day hard purge; deleted folders remain on disk until you remove them.

## Where data is stored

All data lives under `<workspace>/.colcoor/`:

```
.colcoor/
  profile.json                      # local single-user identity
  conversations/
    <conversation-id>/
      meta.json                     # title, pins, active node, timestamps
      events.jsonl                  # one append-event record per line (append-only)
      notes.jsonl
      lists.json
      images/                       # uploaded image blobs + index.json
```

Because the store is rooted at the current workspace folder, **switching workspaces
shows only the conversations you started there.**

Events are stored one-per-line in the same shape used by the backend
`POST /conversations/{id}/append-event` API (see [api-contracts.md](../product/api-contracts.md)),
which keeps a future "upload this conversation to the backend" feature a straightforward
parent-id remapping replay.

### Git

The `.colcoor/` folder contains your local conversations. If you do not want to commit
them, add this to your workspace `.gitignore`:

```gitignore
.colcoor/
```

## What is not available offline

Offline mode is single-user by design, so collaboration features are disabled:

- Members / invites (Add member, Change role, Remove member)
- Side chat (no realtime channel; the side-chat stream is inert)
- Backend billing/quota enforcement

These commands are hidden from the conversations row menu in local mode
(`colcoor.localMode` context key). Invoking a collaboration action from the Command
Palette returns a clear "not available in offline mode" message.

## Packaging

The regular VSIX already supports both modes. To emit the packaged artifact into a
dedicated distribution folder with a short offline README:

```bash
npm run package:extension:standalone
# -> dist/colcoor-standalone-EXT<version>/colcoor-extension-<version>.vsix
```
