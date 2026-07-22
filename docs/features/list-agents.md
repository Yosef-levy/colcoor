# List agents (jobs)

Extension-orchestrated **list-builder** and **list-operator** agents. The Colcoor backend does **not** run these LLMs.

## Package layout

Jobs freeze under `.colcoor/jobs/<job_id>/`:

| File | Role |
|------|------|
| `manifest.json` | Immutable identity, schema version, file hashes, optional workspace fingerprint |
| `state.json` | Mutable status / phase / scan summary |
| `SCHEMA.md` | Package contract (`list-agent-package/v1`) |
| `request.md` | User criteria or operator request |
| `events.jsonl` | Lite events in **DFS preorder** |
| `notes.jsonl` / `lists.json` | Lite notes and lists |
| `scan_state.json` | Controller-owned scan coverage (builder) |
| `out/` | Proposals, repairs, rejected, artifacts, `progress.jsonl`, `agent_output.txt` (progress log), `agent_final.txt` (final reply) |
| `run_log.jsonl` | Append-only progress |

## Capability profiles

- **list-builder-readonly** — read package; write proposals under the job dir; Colcoor verifies and commits after review.
- **list-operator-workspace** — may edit workspace files when the request requires it; normal tool approvals.

## Builder flow

Freeze → controller-owned chunk scan with coverage → proposals → structural verification → targeted repair (max 3) → user semantic review → extension-built anchors → `createConversationList` / `createConversationListItem`.

Structurally valid ≠ accepted. No silent commit unless pre-run auto-commit.

## Commands

- `colcoor.buildListFromConversation`
- `colcoor.runAgentOnLists`
- `colcoor.openListAgentJobs`

Progress opens in a hideable webview (`colcoor.listAgentJob`); closing the panel does not cancel the run.
