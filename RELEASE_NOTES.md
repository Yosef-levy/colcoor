# Colcoor release notes

**Bundle:** `colcoor-gcp-production-BE0.1.0-EXT0.0.1`  
**Backend:** 0.1.0 · **Extension:** 0.0.1

Install the VSIX and backend image from the **same** bundle folder. Customer operators follow **`README.md`** inside the bundle. See [docs/release-versions.md](docs/release-versions.md).

## Highlights

### GCP multi-VM production

- Customer bundle: `colcoor-gcp-production-BE*-EXT*` with Cloud SQL, Memorystore Redis, GCS, multi-VM deploy scripts
- Wrapper scripts: `deploy-primary.sh`, `deploy-replica.sh`, `health-check.sh`, `create-shared-env.sh`
- Cloud SQL backup: `./scripts/gcp/backup-cloudsql.sh`
- **Ship `.tar.gz`** (not zip) so script permissions survive extraction on Linux

### Reliability and observability

- Centralized API error envelope with `request_id`
- HTTP retries and clearer SSE reconnect UX in the extension
- Prometheus metrics (`/metrics`) and structured JSON logging
- Per-user rate limiting (IP fallback for anonymous traffic)

### Local development

- `docker-compose.yml` and `docker-compose.self-host.yml` for repo development only (bundled Postgres/Redis)
- Env-driven deployment profiles and offline license scaffold

## Known limitations

- Lemon Squeezy license activation not included
- SSO/SAML/SCIM and Helm charts are future work
- Rate limits are per API worker (in-memory); Redis-backed limits for multi-replica later

## Quick start

Maintainers: [docs/release-quickstart.md](docs/release-quickstart.md). Customers: **`README.md`** in the bundle.

## Verify

[docs/release-smoke-test.md](docs/release-smoke-test.md)
