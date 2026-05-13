# Colcoor

Monorepo for the **Colcoor** product: an **extension-dedicated backend** plus client extensions for **Cursor / VS Code** and **Claude Desktop**. Product semantics are under [`docs/README.md`](docs/README.md). **Normative HTTP:** [`docs/api-contracts.md`](docs/api-contracts.md). **Roles:** [`docs/permissions.md`](docs/permissions.md). **Usage / billing:** [`docs/billing-usage.md`](docs/billing-usage.md).

## Layout

| Path | Role |
|------|------|
| [`packages/extension`](packages/extension) | VS Code / Cursor extension (transcript construction, Cursor agent invocation, UI shell) |
| [`packages/claude_extension`](packages/claude_extension) | Claude Desktop Extension (DXT / MCP server) — exposes the same backend to Claude Desktop; no main-thread agent or transcript builder. See its own [README](packages/claude_extension/README.md). |
| [`packages/backend`](packages/backend) | HTTP API: event graph, tree, side chat, auth — **no** main-thread LLM or transcript-over-HTTP |

## Database

Canonical PostgreSQL schema (tables, columns, constraints, DDL): **[`docs/database.md`](docs/database.md)**.

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

**Cursor / VS Code extension** (launch from VS Code / Cursor: **Run Extension**)

```bash
npm install
npm run build
```

Open `packages/extension` in the editor and use the generated launch configuration, or install [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension) workflow you prefer.

**Claude Desktop extension** (self-contained; not part of the root npm workspace)

```bash
cd packages/claude_extension
npm install
npm run build       # → dist/server.js (MCP server bundle)
npm run package     # → build/colcoor-claude-extension-<version>.dxt
```

Setup, install, and end-to-end test instructions are in [`packages/claude_extension/README.md`](packages/claude_extension/README.md).

## CI

GitHub Actions runs lint/build for the extension and ruff/pytest for the backend (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Production (Linux VM, Docker Compose + nginx)

Full runbook: **[`docs/production.md`](docs/production.md)** (architecture, env, health, nginx, backups checklist).

Quick start from repo root:

```bash
cp .env.example .env
# Edit secrets and DATABASE_URL; then:
docker compose -f docker-compose.prod.yml up -d --build
```

The **API is Python (FastAPI)** in `packages/backend/`. The root `package.json` is for the Cursor / VS Code editor extension only; the Claude Desktop extension ships its own `package.json` and bundle inside `packages/claude_extension/`.

## Ship artifacts (VSIX + Docker image)

From the repo root (requires Docker for the image build):

```bash
npm run ship:artifacts
```

See **[`docs/production.md`](docs/production.md)** § Release artifacts for outputs and optional registry push.

**Enterprise bundle** (image `.tar.gz` + VSIX + compose + operator scripts for the customer VM):

```bash
npm run bundle:enterprise
```

Output directory: **`dist/colcoor-enterprise-BE…-EXT…/`** (see `README.customer.txt` inside the bundle).

**Cursor / VS Code extension backend URL:** after setting **`colcoor.backendBaseUrl`** (or **`COLCOOR_API_URL`**), run **Developer: Reload Window** from the Command Palette so Colcoor uses the new API origin.

**Claude Desktop extension backend URL:** set **`COLCOOR_BACKEND_URL`** in the DXT user-config form rendered by Claude Desktop when the `.dxt` is installed (same URL rules — origin only, no path, no trailing slash). See [`packages/claude_extension/README.md`](packages/claude_extension/README.md).

On a **Docker-only** server without extension dev deps, use **`npm run bundle:enterprise:skip-vsix`** and copy the `.vsix` from a machine where `npm install` and **`npm run package:extension`** work (artifact under **`dist/colcoor-enterprise-BE…-EXT…/`**). The Claude Desktop `.dxt` is not part of `bundle:enterprise` yet — build it independently from `packages/claude_extension/` as shown above.
