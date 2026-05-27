# GCP production handoff checklist

Copy-paste checklist for customer IT / security when shipping Colcoor on **Google Cloud** (multi-VM + Cloud SQL + Memorystore + GCS).

## Build (Colcoor team)

```bash
npm run test
npm run bundle:gcp-production
```

On a host with Docker but **no** Node extension build, use **`npm run bundle:gcp-production:skip-vsix`** and ship the `.vsix` from a dev machine separately.

Ship **`dist/colcoor-gcp-production-BE…-EXT….tar.gz`** and **`.tar.gz.sha256`** — **not** a zip (zip often drops executable bits on `scripts/*.sh`).

## Customer receives

- Pre-built backend + PgBouncer image tarballs
- Extension `.vsix` (unless noted in `EXTENSION_VSIX_NOT_INCLUDED.txt`)
- `docker-compose.yml` (nginx + backend + PgBouncer only)
- `scripts/` — load images, GCP provision, deploy primary/replica, health check, Cloud SQL backup
- **`README.md`** — sole operator entry point (VM creation through health check)

## Customer rollout (summary)

1. Create GCE API VMs (same VPC/region), install Docker.
2. Extract `.tar.gz`, verify checksum, `./scripts/00-load-images.sh` on each VM.
3. `cp gcp.env.example gcp.env`, edit project/bucket/VM names.
4. `./scripts/create-shared-env.sh` (once) → `shared.env`.
5. Primary VM: `./scripts/deploy-primary.sh` → `./scripts/health-check.sh`.
6. Copy `shared.env` to replicas; `./scripts/deploy-replica.sh` on each.
7. Optional: `./scripts/create-shared-env.sh --with-lb` or `./scripts/gcp/provision-load-balancer.sh`.
8. Install VSIX; set backend base URL to load balancer IP; reload window.

## Backups

- Postgres: `./scripts/gcp/backup-cloudsql.sh --config ./gcp.env` (export to GCS).
- Enable Cloud SQL automated backups in GCP console or `gcloud sql instances patch`.
- GCS image objects: bucket versioning or periodic `gcloud storage` sync.

## Security notes

- Treat `shared.env`, `gcp.env`, and `.env` as secrets (mode 600).
- Do not expose Cloud SQL or Redis publicly; use private IPs in the VPC.
- Same `JWT_SECRET` on every API VM.
