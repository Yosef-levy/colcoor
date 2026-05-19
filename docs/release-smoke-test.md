# Release smoke-test checklist

Run after building or receiving a release bundle.

## Automated (build machine)

From repo root:

```bash
npm run typecheck -w colcoor-extension
npm run test:extension
npm run test:backend
npm run bundle:release
```

`bundle:release` runs **`validate:release`** (script permissions + tarball extract).

## Unpack (customer VM)

```bash
sha256sum -c colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz.sha256
tar -xzf colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz
cd colcoor-enterprise-BE0.1.0-EXT0.0.1
test -x install-colcoor.sh || bash scripts/ensure-executable.sh
```

## Install (happy path)

| Step | Command | Expected |
|------|---------|----------|
| One-shot install | `./install-colcoor.sh` | Images loaded, stack up, health OK, URL printed |
| Firewall | Inbound TCP **80** open on VM | `curl http://<VM-IP>/health` from another host returns `{"status":"ok"}` |

## Backend (after install)

| Step | Command / action | Expected |
|------|------------------|----------|
| Local health | `curl -fsS http://localhost/health` | `{"status":"ok"}` |
| Local ready | `curl -fsS http://localhost/ready` | `"status":"ready"` |
| VM health | `curl -fsS http://<VM-IP>/health` | `{"status":"ok"}` |
| License (auth) | Sign in via extension, then `curl -H "Authorization: Bearer $JWT" http://localhost/api/v1/system/license` | JSON with `license_type`, `max_users`, `current_users` |
| Free limit | 4th new user sign-in | HTTP 403, `license_user_limit_reached` |

Debug port **8080** (optional): set `SELF_HOST_HTTP_PORT=8080` in `.env`, recreate stack, use `http://localhost:8080/health`.

Backend container listens on **8000** internally only (not published to the host).

## Extension

| Step | Action | Expected |
|------|--------|----------|
| VSIX install | Install from bundle VSIX | Extension activates |
| Backend URL | `colcoor.backendBaseUrl` | `http://<VM-IP>` (port 80, no suffix) |
| Sign-in | Colcoor: Sign in | Conversations load |
| Conversation | Add + message | Tree shows messages |
| Invite | Invite collaborator | Success toast with role |
| Side chat | 2+ members | SSE works; reconnect banner on blip |
| Onboarding | First open | Getting started / try-this-next (dismissible) |

## Manual compose (developers, repo root)

```bash
cp .env.example .env
./scripts/generate-self-host-secrets.sh >> .env
docker compose -f docker-compose.self-host.yml up -d --build
curl -sS http://localhost/health
curl -sS http://localhost/ready
```

## Not in this checklist

- HTTPS / Let's Encrypt / custom domain
- Production GCS image uploads (enterprise compose)
- Lemon Squeezy license activation
