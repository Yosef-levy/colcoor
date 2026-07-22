# Colcoor — Cursor extension documentation

Standalone **product specification** for the **Colcoor Cursor extension** and its **Colcoor HTTP backend**: branching conversations (tree, active node, transcript, notes, side chat), with the **Cursor agent** as the main-thread generator.

**Normative principles** (transcript authority, context layers, determinism, UX): **[principles.md](principles.md)**. On conflict, **principles.md** wins unless another doc explicitly defers.

## What Colcoor is

- **Structured memory:** explicit **tree** of **`user_input`** / **`assistant_output`** events, **branching**, per-user **active node**.
- **Notes** on messages (not tree nodes).
- **Side chat** per conversation ([domain-model.md](product/domain-model.md) §6).
- **Transcript:** deterministic text built **only in the extension** ([transcript-format.md](product/transcript-format.md)); the backend **does not** expose transcript-over-HTTP.

## Product spec (`product/`)

| Doc | Purpose |
|-----|---------|
| [api-contracts.md](product/api-contracts.md) | **Normative REST + SSE** (paths, JSON schemas, status codes, auth) |
| [domain-model.md](product/domain-model.md) | Tree semantics, **`visible_to`**, **`active_event_id`**, notes, side chat |
| [database.md](product/database.md) | PostgreSQL DDL aligned to the API |
| [data-flow-and-api.md](product/data-flow-and-api.md) | Main-thread turn order and agent handoff (**references api-contracts**) |
| [transcript-format.md](product/transcript-format.md) | Agent transcript wire format |
| [permissions.md](product/permissions.md) | Role matrix (**owner** / **editor** / **viewer**) and enforcement locus |
| [tree-ui-contract.md](product/tree-ui-contract.md) | **Normative** conversation tree: node state, selection vs actions, future layouts |
| [ui-features.md](product/ui-features.md) | User-visible UI checklist (thread, tree, drawers / in-conversation search, side-chat settings, 401 handling) |
| [architecture.md](product/architecture.md) | Components and boundaries |

## Auth & billing (`auth/`)

| Doc | Purpose |
|-----|---------|
| [authentication.md](auth/authentication.md) | **`cursor_sub`**; **`POST /api/v1/auth/cursor`** |
| [monetization.md](auth/monetization.md) | Tokens on every request; links **billing-usage** |
| [billing-usage.md](auth/billing-usage.md) | **`usage_monthly`** vs **`usage_events`**; **402** / quotas |

## Features (`features/`)

| Doc | Purpose |
|-----|---------|
| [offline-mode.md](features/offline-mode.md) | Offline single-user mode (`colcoor.storageMode=local`, `.colcoor/` workspace storage) |
| [list-agents.md](features/list-agents.md) | List-builder / list-operator jobs (freeze, verify, review) |
| [git-integration.md](features/git-integration.md) | Optional Git metadata |
| [side-chat-realtime.md](features/side-chat-realtime.md) | Side-chat SSE and Redis pub/sub |

## Operations (`ops/`)

| Doc | Purpose |
|-----|---------|
| [production.md](ops/production.md) | Docker, nginx, env, health, release builds (`bundle:gcp-production`) |
| [deployment-profiles.md](ops/deployment-profiles.md) | Deployment profiles and tier configuration |
| [self-host.md](ops/self-host.md) | Local development Compose (not a customer path) |
| [multi-vm-deploy.md](ops/multi-vm-deploy.md) | Multiple API VMs, `shared.env`, `deploy-multi-vm.sh` |
| [gcp-provisioning.md](ops/gcp-provisioning.md) | GCP: Cloud SQL, Redis, GCS, LB scripts |
| [pgbouncer.md](ops/pgbouncer.md) | Connection scaling, pool env vars, sizing examples |
| [backup-and-restore.md](ops/backup-and-restore.md) | Postgres and GCS backup/restore runbooks |
| [monitoring.md](ops/monitoring.md) | Metrics, structured logs, Prometheus, Grafana |
| [image-storage.md](ops/image-storage.md) | GCS / local image storage contract |
| [install-vsix.md](ops/install-vsix.md) | VSIX installation |

## Release (`release/`)

| Doc | Purpose |
|-----|---------|
| [release-quickstart.md](release/release-quickstart.md) | Build and verify GCP production bundle (maintainers) |
| [release-smoke-test.md](release/release-smoke-test.md) | Post-build / post-install verification checklist |
| [release-versions.md](release/release-versions.md) | Backend ↔ extension version pairing |
| [enterprise-handoff-checklist.md](release/enterprise-handoff-checklist.md) | GCP production handoff checklist for customer IT |

## SCM standard (`scm/`)

Portable **Structured Conversation Model** spec and adoption guides: **[scm/README.md](scm/README.md)**.

Cross-references are **within this folder** unless the link is a public standard (e.g. VS Code SecretStorage).
