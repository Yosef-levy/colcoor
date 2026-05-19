# Colcoor release notes

**Bundle:** `colcoor-enterprise-BE0.1.0-EXT0.0.1`  
**Backend:** 0.1.0 · **Extension:** 0.0.1

Install the VSIX and backend image from the **same** bundle folder. See [docs/release-versions.md](docs/release-versions.md).

## Highlights

### Reliability and observability

- Centralized API error envelope with `request_id`
- HTTP retries and clearer SSE reconnect UX in the extension
- Prometheus metrics (`/metrics`) and structured JSON logging
- Per-user rate limiting (IP fallback for anonymous traffic)

### Self-host MVP

- `docker-compose.self-host.yml` for local / small VM (free tier, 3 users)
- Env-driven deployment profiles and offline license scaffold
- `GET /api/v1/system/license` for seat/status (authenticated)
- Docs: [docs/self-host.md](docs/self-host.md), [docs/deployment-profiles.md](docs/deployment-profiles.md)

### Onboarding and invite polish

- Dismissible getting-started and “try this next” hints in the conversation panel
- Richer empty states (conversations, tree, side chat, solo collaborator)
- Clearer invite errors and success messages (owner/editor/viewer roles)

## Packaging (Sprint 5)

- Self-host bundle: `dist/colcoor-enterprise-BE0.1.0-EXT0.0.1/` with offline images, VSIX, compose, scripts, and `SHA256SUMS`
- **Ship `colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz`** (not zip) so script permissions survive extraction on Linux
- **One-command install:** `./install-colcoor.sh` — HTTP on port **80** (use `http://<VM-IP>` in the extension; HTTPS planned next)
- `scripts/ensure-executable.sh` fallback if permissions were lost; `npm run validate:release` catches this at build time
- Fixes: empty `COLCOOR_LICENSE_MAX_USERS` no longer crashes startup; local image volume permissions for `/ready`

## Known limitations

- Free self-host: **3 users** per instance; no Lemon Squeezy activation yet
- Enterprise SSO/SAML/SCIM, Helm charts, and signed offline licenses are not included
- Enterprise bundle compose expects GCS for images unless you switch to self-host compose
- Rate limits are per API worker (in-memory); use Redis-backed limits for multi-replica later
- Side-chat SSE is per open panel; manual refresh (↻) remains available

## Quick start

See [docs/release-quickstart.md](docs/release-quickstart.md) and `README.customer.txt` inside the bundle.

## Verify

[docs/release-smoke-test.md](docs/release-smoke-test.md)
