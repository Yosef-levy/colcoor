# Release smoke-test checklist

Run after building or receiving a release bundle.

## Automated (build machine)

From repo root (full release build runs these plus bundle validation):

```bash
npm run typecheck -w colcoor-extension
npm run test:extension
npm run test:backend
npm run bundle:release
```

`bundle:release` ends with **`validate:release`**, which checks:

- Every `scripts/*.sh` in the bundle directory is executable
- Extracting **`dist/colcoor-enterprise-BE…-EXT….tar.gz`** into a temp dir leaves scripts executable
- `SHA256SUMS` inside the bundle verifies

Re-run validation only:

```bash
npm run validate:release
```

## Unpack (customer VM)

Use the **`.tar.gz`**, not a zip of the folder:

```bash
sha256sum -c colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz.sha256
tar -xzf colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz
cd colcoor-enterprise-BE0.1.0-EXT0.0.1
test -x scripts/00-load-image.sh || bash scripts/ensure-executable.sh
```

## Backend (bundle directory)

| Step | Command / action | Expected |
|------|------------------|----------|
| Load images | `./scripts/00-load-image.sh` | `colcoor-backend:prod`, `colcoor-pgbouncer:1.23.1` listed |
| Secrets | `./scripts/01-setup-env.sh` | `.env` + `credentials.generated.txt` created |
| Start | `./scripts/02-stack-up.sh` | All services healthy |
| Health | `./scripts/05-health-check.sh` | `/health`, `/ready`, `/api/v1/health` return OK |
| License (auth) | Sign in via extension, then `curl -H "Authorization: Bearer $JWT" http://localhost:8080/api/v1/system/license` | JSON with `license_type`, `max_users`, `current_users` |
| Free limit | Create 4 distinct users (4th new sign-in) | HTTP 403, `license_user_limit_reached` |

## Extension

| Step | Action | Expected |
|------|--------|----------|
| VSIX install | Install from VSIX in bundle | Extension activates without errors |
| Backend URL | Set `colcoor.backendBaseUrl` | Matches nginx origin (e.g. `http://host:8080`) |
| Sign-in | Colcoor: Sign in | Conversations list loads |
| Conversation | Add conversation + message | Tree shows messages |
| Invite | Conversation → Invite collaborator… | Search + add editor/viewer; success toast with role |
| Side chat | Open side chat with 2+ members | Messages send; SSE reconnect banner on brief network blip |
| Onboarding | First open | Getting started / try-this-next banners (dismissible) |

## Integrity

```bash
cd dist/colcoor-enterprise-BE0.1.0-EXT0.0.1
sha256sum -c SHA256SUMS
```

## Manual compose (developers, repo root)

```bash
cp .env.example .env
./scripts/generate-self-host-secrets.sh >> .env
docker compose -f docker-compose.self-host.yml up -d --build
curl -sS http://localhost:8080/health
curl -sS http://localhost:8080/ready
```

## Not in this checklist

- Production GCS image uploads (enterprise compose)
- Lemon Squeezy license activation
- TLS / public DNS (add nginx certs separately)
