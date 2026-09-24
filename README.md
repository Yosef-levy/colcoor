# Colcoor

**Structured AI conversations for learning and research.**

Colcoor turns long, linear AI conversations into navigable conversation trees.

In the controlled learning experiment described below, Colcoor improved adherence to the predefined learning plan while reducing cumulative conversation context by **90.1%** compared with a conventional linear conversation.

Learning and research rarely happen in a straight line. You explore an idea, branch into a question, compare alternatives, revisit an earlier assumption, and then return to the main thread. In a traditional chat, all of those explorations accumulate into a single growing transcript — making the conversation harder to navigate and repeatedly sending the model context that is no longer relevant to the current task.

Colcoor makes that structure explicit.

Any point in a conversation can become the starting point for a new branch. The model receives only the context along the selected conversation path, while the rest of the exploration remains available to the user without being carried into every future request.

This makes long-running AI work:

- **Navigable** — return to any point and continue from there.
- **Focused** — each branch carries only the context relevant to that line of thought.
- **Efficient** — side explorations do not permanently inflate the context of the main conversation.
- **Reproducible** — the exact context behind a response is explicit rather than reconstructed through hidden memory or summarization.
- **Explorable** — investigate questions, alternatives, and dead ends without disrupting the main learning or research path.
- **Collaborative** — multiple people can work around the same structured conversation.

> **Project status:** Active development.

Website: [colcoor.com](https://www.colcoor.com/)

## Why this matters

AI models can increasingly work with large context windows and large collections of sources. But the interaction itself is still usually organized as a linear chat.

For short conversations, that works well.

For a multi-hour learning session, literature investigation, technical research project, or any process involving repeated exploration and revision, the conversation itself becomes part of the knowledge structure.

A learner may stop to clarify a definition, explore an example, solve several exercises, and then return to the original lesson. A researcher may investigate competing explanations, discard one path, and later revisit another. In a linear chat, all of those paths remain mixed together in every subsequent turn.

Colcoor makes the structure of that process first-class.

## Evidence: structured vs. linear conversation

To measure the effect, the same proof-based linear algebra learning program was conducted twice:

1. once using a conventional linear conversation; and
2. once using Colcoor's branching conversation structure.

Both runs used the same model, syllabus, generation settings, and corresponding learning tasks. Where applicable, corresponding model calls used the **same seed and a temperature of 0** to reduce run-to-run variation. This made the comparison controlled; it did not make model generation perfectly deterministic.

The Colcoor run contained 104 model responses and the linear run contained 81. The different turn counts reflect how each learning process unfolded. In addition, 43 user prompts were exactly identical across the two runs, providing a narrower apples-to-apples comparison.

### Context usage

| Metric                       | Colcoor tree | Linear conversation |
| ---------------------------- | -----------: | ------------------: |
| Model responses              |          104 |                  81 |
| Cumulative context tokens    |      422,195 |           4,248,190 |
| Average context per response |        4,060 |              52,447 |

These measurements count the conversation context processed by the model for each response, including input tokens served from cache. They do not include output tokens and should not be interpreted as total API token usage.

Despite containing more model responses, the Colcoor run used **90.1% less cumulative conversation context** and **92.3% less context per model response**.

On the 43 exactly identical user prompts, the Colcoor run used approximately **92% less context**.

> Near the end of the experiment, equivalent requests sometimes required only **~4–5K context tokens with Colcoor versus more than 100K in the linear conversation**.

The difference was small near the beginning, when both histories were short, and grew as the learner asked more questions and explored more side topics.

This is the behavior Colcoor is designed for: a clarification asked early in a course remains available where it belongs, but it does not have to be resent to the model during every later topic.

### Response quality

Both runs produced mathematically correct responses overall in the review conducted for this comparison. The observable difference was adherence to the predefined syllabus.

The linear run showed four clear syllabus-adherence failures, including omitted required material, premature completion of partially covered material, restructuring of predefined modules, and substitution of unscheduled material. None of these discrepancies occurred in the Colcoor run.

In this experiment, the tree-structured run therefore showed better syllabus and task-structure adherence. This is evidence from one learning program, not a claim that tree-structured conversations always produce better answers.

### What this experiment does — and does not — show

This is one controlled learning experiment, not a claim that every conversation will achieve a 90% reduction or that tree-structured conversations will always produce better answers.

The benefit depends on the shape of the interaction. Short or nearly linear conversations should show little difference. The advantage grows when users ask clarification questions, revisit earlier material, explore alternatives, or otherwise create branches that would remain permanently embedded in a conventional chat history.

The combined conversation graph, model metadata, embedded syllabus, measurement methodology, and token counts are available here:

**[View the controlled comparison →](experiments/linear-algebra/README.md)**

## Why conversation structure matters

**Large context windows solve capacity. Colcoor addresses relevance.**

A larger context window determines how much history a model can receive, but not which parts of that history are relevant to the current task. In a long linear chat, clarifications, alternatives, and abandoned paths remain in every later request simply because they happened earlier.

Colcoor treats conversation structure as part of context management. Each branch carries the history needed for its current line of reasoning without forcing unrelated explorations into every future model call.

In this experiment, focused context coincided with both dramatically less repeated conversation context and better preservation of the predefined learning structure. One experiment cannot establish that relationship universally, but it shows why conversation structure matters beyond navigation or UI.

## Features for learning and research

### Branching with explicit context

Branch from any message, continue from an earlier point, resend a prompt, or explore privately before committing a branch to the shared conversation. Checkpoints label important milestones. For every response, Colcoor constructs the model context deterministically from the selected root-to-node path and its notes—not from the rest of the tree.

### Structured learning workflows

Start with built-in templates for **Learning / tutoring**, a **Structured learning program**, or **Research**. Templates are stored as notes at the conversation root, so their guidance is present on every branch. The structured learning template supports a stable syllabus and progress tracking across branches in `.colcoor/docs/<conversation_id>_syllabus.md`; machine-local custom templates can be created, reordered, imported, and exported.

### Tools for working with knowledge

Attach notes to messages, star important responses, track TODO notes, search across a conversation, and organize material into conversation lists. List agents can build structured lists from a conversation or work on existing lists. Threads render Markdown, code, and LaTeX for technical and mathematical work.

### Collaboration without context pollution

Owners, editors, and viewers can work in the same conversation. A separate side chat lets collaborators discuss and reference messages or notes without inserting that coordination into the model's reasoning path.

### Flexible providers and storage

Use Anthropic by default with your own API key, Gemini, or the Cursor agent provider. Run with the shared backend for collaboration, or use offline single-user mode to keep conversations in the workspace under `.colcoor/`.

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
- Anthropic, Gemini, and Cursor agent integrations

## Repository guide

Monorepo for the **Colcoor editor extension** and its backend for structured learning and research conversations. Product semantics are under [`docs/README.md`](docs/README.md). **Normative HTTP:** [`docs/product/api-contracts.md`](docs/product/api-contracts.md). **Roles:** [`docs/product/permissions.md`](docs/product/permissions.md). **Usage / billing:** [`docs/auth/billing-usage.md`](docs/auth/billing-usage.md).

## Layout

| Path | Role |
|------|------|
| [`packages/extension`](packages/extension) | VS Code / Cursor UI, deterministic transcript construction, and Anthropic, Gemini, or Cursor assistant invocation |
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

[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue.svg)](LICENSE)

Colcoor is **Source Available (BUSL-1.1)** under the **Business Source License 1.1**. It is not an OSI-approved Open Source project.

Personal use, educational use, academic research, internal non-production evaluation by organizations, forks, and contributions are allowed under the terms in [`LICENSE`](LICENSE).

Organizations need a commercial license for production use, hosted/SaaS offerings, commercial product embedding, OEM distribution, or selling services or products based on Colcoor. See [`COMMERCIAL_LICENSE.md`](COMMERCIAL_LICENSE.md).

**Need a commercial license? Contact <support@colcoor.com>.**
