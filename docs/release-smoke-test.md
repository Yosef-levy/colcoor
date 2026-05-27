# Release smoke test

Post-build verification for maintainers and optional staging installs.

## After `npm run bundle:gcp-production`

Validation runs automatically. Re-run manually:

```bash
npm run validate:release
```

Checks:

- Required GCP bundle files present (`README.md`, wrapper scripts, `scripts/gcp/*`)
- **No** legacy self-host/enterprise scripts (`01-setup-env.sh`, `install-colcoor.sh`, bundled Postgres backup wrappers)
- `docker-compose.yml` has no bundled `postgres` or `redis` services
- `SHA256SUMS` and `.tar.gz` extract preserve script `+x`

## Staging (GCP project)

1. Extract bundle on a test GCE VM; `./scripts/00-load-images.sh`.
2. Configure `gcp.env`; `./scripts/create-shared-env.sh --dry-run` (optional).
3. `./scripts/create-shared-env.sh` against a **non-production** GCP project.
4. `./scripts/deploy-primary.sh --skip-provision` if infra already exists.
5. `./scripts/health-check.sh` and `curl` through load balancer if configured.
6. Install VSIX; sign in; create a conversation branch.

## Local dev stack (not the customer bundle)

```bash
cp .env.example .env
./scripts/generate-self-host-secrets.sh >> .env
docker compose -f docker-compose.self-host.yml up -d --build
curl -fsS http://127.0.0.1:8080/ready
```

This uses **bundled Postgres/Redis** for development only — not shipped to customers.

## Not covered here

- Production GCS image uploads (configured in `shared.env` during GCP provisioning)
- Lemon Squeezy license activation (future)
