# Colcoor (Cursor extension)

Monorepo for the **Colcoor Cursor extension** and its **extension-dedicated backend**. Product semantics are under [`docs/README.md`](docs/README.md). **Normative HTTP:** [`docs/api-contracts.md`](docs/api-contracts.md). **Roles:** [`docs/permissions.md`](docs/permissions.md). **Usage / billing:** [`docs/billing-usage.md`](docs/billing-usage.md).

## Layout

| Path | Role |
|------|------|
| [`packages/extension`](packages/extension) | VS Code / Cursor extension (transcript construction, agent invocation, UI shell) |
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

**Extension** (launch from VS Code / Cursor: **Run Extension**)

```bash
npm install
npm run build
```

Open `packages/extension` in the editor and use the generated launch configuration, or install [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension) workflow you prefer.

## CI

GitHub Actions runs lint/build for the extension and ruff/pytest for the backend (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Production (Linux VM, Docker Compose + nginx)

Full runbook: **[`docs/production.md`](docs/production.md)**. **Multi-VM / GCP:** **[`docs/gcp-provisioning.md`](docs/gcp-provisioning.md)** — `./scripts/deploy-multi-vm.sh deploy-primary`.

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

See **[`docs/production.md`](docs/production.md)** § Release artifacts for outputs and optional registry push.

**GCP production bundle** (image `.tar.gz` + VSIX + compose + operator scripts for multi-VM GCE):

```bash
npm run bundle:gcp-production
```

Output directory: **`dist/colcoor-gcp-production-BE…-EXT…/`** (customer entry point: **`README.md`** inside the bundle).

**Extension backend URL:** after setting **`colcoor.backendBaseUrl`** (or **`COLCOOR_API_URL`**), run **Developer: Reload Window** from the Command Palette so Colcoor uses the new API origin.

On a **Docker-only** server without extension dev deps, use **`npm run bundle:gcp-production:skip-vsix`** and copy the `.vsix` from a machine where `npm install` and **`npm run package:extension`** work.
