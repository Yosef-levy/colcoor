# Deployment profiles

Colcoor ships **one backend codebase** and **one container image**. Commercial tiers and deployment shapes differ only through configuration:

- `COLCOOR_DEPLOYMENT_PROFILE` — where and how you run the stack
- `COLCOOR_LICENSE_TYPE` / `COLCOOR_LICENSE_MAX_USERS` / `COLCOOR_LICENSE_KEY` — entitlements
- Environment variables (Postgres, Redis, object storage, `WEB_CONCURRENCY`, feature flags)
- External services (Cloud SQL, Memorystore, GCS, Lemon Squeezy later)

There are **no** separate backend repositories or images per tier.

## Customer deployment (GCP production)

The **only supported customer handoff** is the GCP multi-VM production bundle:

```bash
npm run bundle:gcp-production
```

Output: **`dist/colcoor-gcp-production-BE<backend>-EXT<extension>/`**. Operators follow **`README.md`** inside the bundle (GCE VMs → Cloud SQL / Redis / GCS → primary + replica deploy → health check).

See also:

- [gcp-provisioning.md](gcp-provisioning.md) — repo-side detail on GCP scripts
- [multi-vm-deploy.md](multi-vm-deploy.md) — `shared.env`, roles, migrations

## Local development (not a customer profile)

For **repo development only**, use root **`docker-compose.yml`** (Postgres + Redis + backend) or **`docker-compose.self-host.yml`** (full stack with nginx on port 80). These stacks bundle Postgres/Redis on the same machine and are **not** shipped in customer bundles.

See [self-host.md](self-host.md) for the optional self-host Compose workflow used during development.

## Profile values (`COLCOOR_DEPLOYMENT_PROFILE`)

| Value | Meaning |
|-------|---------|
| `free` | Local dev / self-host Compose defaults |
| `gcp-production` | GCP multi-VM production (`shared.env` from provisioning scripts) |
| `team`, `business`, `hosted`, `enterprise` | Reserved / future; invalid combinations fail at startup |

## Configuration reference

| Variable | Purpose |
|----------|---------|
| `COLCOOR_DEPLOYMENT_PROFILE` | Topology hint |
| `COLCOOR_LICENSE_TYPE` | Entitlement tier (`free`, `team`, `business`, `enterprise`) |
| `COLCOOR_LICENSE_MAX_USERS` | Seat cap override (unset → tier default; `0` = unlimited) |
| `COLCOOR_LICENSE_KEY` | Optional key for paid tiers (Lemon Squeezy later; never logged) |

Invalid values fail at **startup** with a clear error.

## Related docs

- [production.md](production.md) — Docker, nginx, env, health, release builds
- [gcp-provisioning.md](gcp-provisioning.md)
- [multi-vm-deploy.md](multi-vm-deploy.md)
- [self-host.md](self-host.md) — **development only**
