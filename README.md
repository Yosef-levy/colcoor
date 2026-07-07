# Colcoor (Cursor extension)

[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue.svg)](LICENSE)

## Project philosophy

Large language models have transformed how we interact with knowledge. However, most AI systems still force users into linear conversations that are difficult to revisit, extend, or collaborate on.

Colcoor is built around a different idea:

> **Complex AI conversations should become structured knowledge, not disposable chat history.**

Colcoor is an event-driven platform for orchestrating AI-assisted research workflows inside Cursor. It represents conversations as deterministic event graphs, enabling branching exploration, reproducible reasoning paths, collaborative knowledge building, and structured tool-assisted workflows.

Instead of treating AI conversations as disposable chat history, Colcoor treats them as persistent knowledge that can be explored, extended, reproduced, and shared. Notes, starred messages, and conversation drawers help users summarize, revisit, and organize important reasoning paths over time.

> **Project status:** Active development.

Website: [colcoor.com](https://www.colcoor.com/)

## Why Colcoor?

Current AI chat interfaces work well for short conversations, but they begin to break down during long-running research and learning projects:

- Conversations become long and filled with irrelevant context.
- Starting a new chat loses valuable reasoning.
- Comparing alternative approaches is difficult.
- Revisiting previous ideas is cumbersome.
- Collaboration around AI conversations is hard to coordinate.

Colcoor addresses these challenges by replacing linear conversations with structured conversation graphs.

## Core concepts

### Conversation graphs

Every user input and assistant response becomes part of a deterministic event graph rather than only a linear transcript.

This enables:

- Branching exploration
- Parallel hypotheses
- Persistent reasoning history
- Reproducible AI workflows

### Deterministic context

Instead of relying on conversation summarization or heuristic memory, Colcoor reconstructs the agent transcript from the explicit conversation path selected by the user.

Every main-thread assistant response is generated from a defined reasoning path.

### Research-first design

Colcoor is designed for knowledge-intensive work such as:

- Scientific research
- Learning complex subjects
- Literature review
- Technical investigations
- Architecture exploration
- Long-running AI-assisted projects

### Collaborative knowledge building

Multiple users can contribute to the same conversation graph, with role-based access and shared conversation state.

Side chat gives humans a separate discussion space beside the main reasoning path, so they can coordinate, ask questions, and reference messages or notes without changing the canonical conversation graph.

Knowledge evolves collaboratively rather than being scattered across independent chat sessions.

### Tool-assisted workflows

Colcoor runs the main assistant through the Cursor agent and preserves the resulting transcript in the conversation graph. Tool approvals, side chat references, notes, and selected workspace hints can become part of a reproducible workflow around the saved conversation.

## Key features

- Conversation graphs instead of linear chats
- Branch-first exploration
- Deterministic transcript reconstruction
- Persistent research history
- Collaborative conversation membership
- Notes attached to messages
- Starred messages and TODO-note drawers
- Conversation lists for organizing work
- In-conversation search and navigation
- Cursor agent integration
- Event-driven backend architecture

## Technology stack

**Backend**

- Python 3.12+
- FastAPI
- PostgreSQL
- SQLAlchemy / Alembic
- Redis and Google Cloud Storage support for production deployments

**Extension**

- TypeScript
- VS Code / Cursor extension APIs
- Webview-based UI
- Cursor CLI agent integration

## Roadmap

- Multi-user collaboration improvements
- Advanced knowledge search
- Enhanced tool and MCP approval workflows
- AI-assisted research agents
- Rich visualization of knowledge graphs

## Repository guide

Monorepo for the **Colcoor Cursor extension** and its **extension-dedicated backend**. Product semantics are under [`docs/README.md`](docs/README.md). **Normative HTTP:** [`docs/product/api-contracts.md`](docs/product/api-contracts.md). **Roles:** [`docs/product/permissions.md`](docs/product/permissions.md). **Usage / billing:** [`docs/auth/billing-usage.md`](docs/auth/billing-usage.md).

## Layout

| Path | Role |
|------|------|
| [`packages/extension`](packages/extension) | VS Code / Cursor extension (transcript construction, agent invocation, UI shell) |
| [`packages/backend`](packages/backend) | HTTP API: event graph, tree, side chat, auth — **no** main-thread LLM or transcript-over-HTTP |

## Database

Canonical PostgreSQL schema (tables, columns, constraints, DDL): **[`docs/product/database.md`](docs/product/database.md)**.

## Prerequisites

- Node.js 20+ and npm (for the extension workspace)
- Python 3.12+ and pip (for the backend)
- Docker (optional) for local PostgreSQL via `docker compose up -d`

## Quick start

**Backend**

```bash
cd packages/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn colcoor_backend.main:app --reload --host 127.0.0.1 --port 8000
```

**Extension** (launch from VS Code / Cursor: **Run Extension**)

```bash
npm install
npm run build
```

Open `packages/extension` in the editor and use the generated launch configuration, or install [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension) workflow you prefer.

## CI

GitHub Actions runs lint/build for the extension and ruff/pytest for the backend (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Production (Linux VM, Docker Compose + nginx)

Full runbook: **[`docs/ops/production.md`](docs/ops/production.md)**. **Multi-VM / GCP:** **[`docs/ops/gcp-provisioning.md`](docs/ops/gcp-provisioning.md)** — `./scripts/deploy-multi-vm.sh deploy-primary`.

Quick start from repo root:

```bash
cp .env.example .env
# Edit secrets and DATABASE_URL; then:
docker compose -f docker-compose.prod.yml up -d --build
```

The **API is Python (FastAPI)** in `packages/backend/`. Root `package.json` is for the editor extension only.

## Ship artifacts (VSIX + Docker image)

From the repo root (requires Docker for the image build):

```bash
npm run ship:artifacts
```

See **[`docs/ops/production.md`](docs/ops/production.md)** § Release artifacts for outputs and optional registry push.

**GCP production bundle** (image `.tar.gz` + VSIX + compose + operator scripts for multi-VM GCE):

```bash
npm run bundle:gcp-production
```

Output directory: **`dist/colcoor-gcp-production-BE…-EXT…/`** (customer entry point: **`README.md`** inside the bundle).

**Extension backend URL:** after setting **`colcoor.backendBaseUrl`** (or **`COLCOOR_API_URL`**), run **Developer: Reload Window** from the Command Palette so Colcoor uses the new API origin.

On a **Docker-only** server without extension dev deps, use **`npm run bundle:gcp-production:skip-vsix`** and copy the `.vsix` from a machine where `npm install` and **`npm run package:extension`** work.

## License

Colcoor is **Source Available (BUSL-1.1)** under the **Business Source License 1.1**. It is not an OSI-approved Open Source project.

Personal use, educational use, academic research, internal non-production evaluation by organizations, forks, and contributions are allowed under the terms in [`LICENSE`](LICENSE).

Organizations need a commercial license for production use, hosted/SaaS offerings, commercial product embedding, OEM distribution, or selling services or products based on Colcoor. See [`COMMERCIAL_LICENSE.md`](COMMERCIAL_LICENSE.md).

**Need a commercial license? Contact <support@colcoor.com>.**
