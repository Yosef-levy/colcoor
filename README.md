# Colcoor (Cursor extension)

Monorepo for the **Colcoor Cursor extension** and its **extension-dedicated backend**. Product semantics and boundaries are defined under [`docs/`](docs/README.md) (see especially [`docs/principles.md`](docs/principles.md)).

## Layout

| Path | Role |
|------|------|
| [`packages/extension`](packages/extension) | VS Code / Cursor extension (transcript construction, agent invocation, UI shell) |
| [`packages/backend`](packages/backend) | HTTP API: event graph, tree, side chat, auth — **no** main-thread LLM or transcript-over-HTTP |

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
