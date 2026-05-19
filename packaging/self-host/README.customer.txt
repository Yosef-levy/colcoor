Colcoor self-host release (backend + extension + Docker Compose)
===========================================================

Free self-host profile: 3 users, local image storage, no cloud license check.

Prerequisites
-------------
  - Linux VM (Ubuntu 22.04+ recommended) with inbound TCP 80 open (443 later)
  - Docker Engine + Docker Compose v2
  - curl, openssl

One-command install
-------------------
  Prefer the release .tar.gz (not zip — zip may drop script permissions):

    sha256sum -c colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz.sha256
    tar -xzf colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz
    cd colcoor-enterprise-BE0.1.0-EXT0.0.1

  If scripts fail with "Permission denied" after zip extract:

    bash scripts/ensure-executable.sh

  Install and start:

    ./install-colcoor.sh

  The installer loads images, creates secrets, starts the stack, runs health checks,
  and prints your URL (e.g. http://203.0.113.10).

  Then install colcoor-extension-*.vsix in Cursor and set Backend base URL to that URL
  (no trailing slash). Sign in from the Colcoor sidebar.

HTTPS / custom domain
---------------------
  Not included in this release. Use plain HTTP on port 80 for now; TLS and domain
  setup are planned next.

Debug / advanced
----------------
  Step-by-step scripts: ./scripts/00-load-image.sh through 05-health-check.sh
  Non-standard HTTP port: set SELF_HOST_HTTP_PORT=8080 in .env before stack up
  Docs: docs/release-quickstart.md, docs/self-host.md

Do not commit or share: .env, credentials.generated.txt
