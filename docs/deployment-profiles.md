# Deployment profiles

Colcoor ships **one backend codebase** and **one container image**. Commercial tiers and deployment shapes differ only through configuration:

- `COLCOOR_DEPLOYMENT_PROFILE` — where and how you run the stack
- `COLCOOR_LICENSE_TYPE` / `COLCOOR_LICENSE_MAX_USERS` / `COLCOOR_LICENSE_KEY` — entitlements
- Environment variables (Postgres, Redis, object storage, `WEB_CONCURRENCY`, feature flags)
- External services (managed DB, GCS/S3, Lemon Squeezy later)

There are **no** separate `free-backend` / `enterprise-backend` repositories or images.

## Profiles

### Free self-host (`free`)

- **Target:** Single VM, homelab, or developer machine
- **Orchestration:** `docker-compose.self-host.yml`
- **Defaults:** Local image storage, Postgres + Redis in Compose, nginx on port 8080
- **Seats:** 3 users (`COLCOOR_LICENSE_TYPE=free`)
- **Support:** Community / best-effort

### Small business self-host (`team`) — later Compose overlay

- **Target:** Same backend image on a slightly larger VM
- **Orchestration:** Planned `docker-compose.team.yml` (stronger resources, same services)
- **Seats:** 10–50 users (paid license via Lemon Squeezy later)
- **Storage:** Local disk or optional GCS

### Business self-host / hosted-style (`business` / `hosted`)

- **Target:** Production traffic, hundreds of users
- **Orchestration:** `docker-compose.prod.yml` or managed cloud (RDS, ElastiCache, GCS)
- **Storage:** GCS (or S3-compatible) recommended
- **Seats:** Paid license key (Lemon Squeezy later)

### Enterprise (`enterprise`)

- **Target:** Customer-owned Kubernetes / OpenShift / private cloud
- **Orchestration:** Helm charts (future); same backend image
- **Seats & features:** Custom contract; SSO/SAML/SCIM and HA are future work

## Configuration reference

| Variable | Purpose |
|----------|---------|
| `COLCOOR_DEPLOYMENT_PROFILE` | Topology hint (`free`, `team`, `business`, `hosted`, `enterprise`) |
| `COLCOOR_LICENSE_TYPE` | Entitlement tier (`free`, `team`, `business`, `enterprise`) |
| `COLCOOR_LICENSE_MAX_USERS` | Seat cap override (unset → tier default; `0` = unlimited) |
| `COLCOOR_LICENSE_KEY` | Optional key for paid tiers (Lemon Squeezy later; never logged) |

Invalid values fail at **startup** with a clear error.

## Lemon Squeezy (future)

Paid self-host will set `COLCOOR_LICENSE_KEY` after purchase. Integration hooks live in `colcoor_backend/licensing/lemonsqueezy.py`. Free self-host does **not** require outbound internet.

## Related docs

- [Self-host installation](self-host.md)
- [Production Compose](../docker-compose.prod.yml)
- [Enterprise bundle](enterprise.md) (offline VSIX + preloaded images — separate packaging, same API)
