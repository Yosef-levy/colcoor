Colcoor self-host release (backend + extension + Docker Compose)
===========================================================

This folder is for a first install on a VM or laptop. It uses the **free self-host**
profile (3 users, local image storage, no cloud license check).

Contents
--------
  colcoor-backend-*.tar.gz       Pre-built API image (load with ./scripts/00-load-image.sh)
  colcoor-pgbouncer-*.tar.gz     Pre-built PgBouncer image
  colcoor-extension-*.vsix       Cursor / VS Code extension
  docker-compose.yml             Self-host stack (nginx, backend, Postgres, Redis)
  .env.example                   Template (no secrets) — see scripts/01-setup-env.sh
  docs/                          self-host.md, deployment-profiles.md, release-quickstart.md
  scripts/                       Operator helpers
  SHA256SUMS / MANIFEST.txt      Integrity and version metadata

Prerequisites
-------------
  Docker Engine + Docker Compose v2
  openssl (for ./scripts/01-setup-env.sh)
  curl (for health checks)

Quick start (about 10 minutes)
------------------------------
  cd /path/to/this-bundle

  ./scripts/00-load-image.sh
  ./scripts/01-setup-env.sh
  ./scripts/02-stack-up.sh
  ./scripts/05-health-check.sh

  Install colcoor-extension-*.vsix in Cursor (Extensions → … → Install from VSIX).
  Settings → Colcoor → Backend base URL:  http://YOUR_HOST:8080
  (no trailing slash). Reload the window if you change the URL.

  Sign in, create a conversation, invite a collaborator (they must sign in once).

Extension install (Cursor)
--------------------------
  1. Command Palette → "Extensions: Install from VSIX…"
  2. Select colcoor-extension-*.vsix in this folder
  3. Reload window when prompted

Backend URL
-----------
  Use the host-visible origin only, e.g. http://203.0.113.10:8080 or http://localhost:8080
  when Cursor runs on the same machine. Not http://backend:8000 (Docker internal).

Free tier
---------
  Up to 3 Colcoor users on this instance (license enforced at sign-up). See docs/deployment-profiles.md.

More detail
-----------
  docs/release-quickstart.md   — full release steps
  docs/self-host.md            — operations and troubleshooting
  docs/release-smoke-test.md   — verification checklist

Do not commit or share: .env, credentials.generated.txt
