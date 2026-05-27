# GCE API VMs — count, sizing, and required properties

Use this guide **before** Step 1 in the bundle **`README.md`**. It explains how many API VMs to create, which machine types to pick, and what each VM must have so Colcoor can reach **Cloud SQL**, **Memorystore Redis**, and **GCS**.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Registered users** | Distinct accounts that have signed in at least once (`users` rows). |
| **Concurrent users** | Users actively using Colcoor at the same time (typing, branching, side chat). |
| **API VM** | One GCE instance running **nginx + backend + PgBouncer** via Docker Compose. |
| **Replica** | Any API VM after the primary; same stack, migrations disabled on start. |

Size for **concurrent** load, not registered headcount alone. A team of 200 registered users with ~10–20 active at peak needs fewer VMs than 80 people online at once.

---

## How many API VMs?

| Goal | Minimum VMs | Notes |
|------|-------------|--------|
| **Production HA** | **2** | One VM can run the stack for a pilot, but production expects **two or more** behind the HTTP load balancer so one VM can fail or drain during upgrades. |
| **Rolling upgrades** | **2+** | Restart primary, then replicas, without full outage. |
| **Higher concurrent load** | **3–4+** | Add VMs when `/ready` stays healthy but p95 latency or CPU on existing VMs stays high under peak traffic. |

Set **`COLCOOR_API_REPLICAS`** in `gcp.env` to the **total API VM count** (not “replicas only”). Pool sizing in `create-shared-env.sh` uses this value.

List every VM name in **`COLCOOR_API_VM_INSTANCES`** (comma-separated, same zone), e.g. `colcoor-api-1,colcoor-api-2,colcoor-api-3`.

---

## Sizing by expected load

Starting points for **typical** Colcoor usage (I/O-bound API, GCS images, SSE side chat). Adjust after observing CPU, memory, and `/ready` under your real traffic.

### Small — up to ~50 registered, ~5–15 concurrent

| Setting | Value |
|---------|--------|
| **API VMs** | 2 |
| **Machine type** | `e2-standard-2` (2 vCPU, 8 GiB RAM) |
| **`WEB_CONCURRENCY`** (per VM) | 2 |
| **`COLCOOR_API_REPLICAS`** | 2 |
| **Cloud SQL tier** (`COLCOOR_CLOUDSQL_TIER`) | `db-custom-2-7680` (2 vCPU, 7.5 GiB, **Enterprise** edition) |
| **Memorystore Redis** | 1 GiB Basic tier |
| **Boot disk** | 30 GiB SSD |

### Medium — up to ~200 registered, ~15–40 concurrent

| Setting | Value |
|---------|--------|
| **API VMs** | 2–3 |
| **Machine type** | `e2-standard-4` (4 vCPU, 16 GiB RAM) |
| **`WEB_CONCURRENCY`** | 4 |
| **`COLCOOR_API_REPLICAS`** | 2 or 3 |
| **Cloud SQL tier** | `db-custom-4-15360` |
| **Memorystore Redis** | 1–5 GiB (Basic or Standard per HA needs) |
| **Boot disk** | 40 GiB SSD |

### Large — up to ~500 registered, ~40–80 concurrent

| Setting | Value |
|---------|--------|
| **API VMs** | 3–4 |
| **Machine type** | `e2-standard-4` or `n2-standard-4` |
| **`WEB_CONCURRENCY`** | 4 (raise to 6 only after profiling) |
| **`COLCOOR_API_REPLICAS`** | 3 or 4 |
| **Cloud SQL tier** | `db-custom-8-30720` or higher |
| **Memorystore Redis** | 5 GiB+ |
| **Boot disk** | 50 GiB SSD |

### Beyond ~500 registered / ~80+ concurrent

Treat the tables above as a floor. Plan:

- More API VMs (horizontal scale) before maxing `WEB_CONCURRENCY` on each VM.
- Cloud SQL tier increase and/or read replicas (not automated by this bundle — operator change).
- Redis Standard tier with replication if side-chat fan-out across many replicas matters.
- Re-run pool sizing after changing VM count:  
  `./scripts/gcp/size-db-pools.sh --shared-env ./shared.env --api-replicas N --web-concurrency N`

**Cloud SQL editions:** GCP defaults new Postgres to **Enterprise Plus**, which uses tiers like `db-perf-optimized-N-2`. The bundle’s `db-custom-*` tiers use **Enterprise** edition; `create-shared-env.sh` sets `--edition=ENTERPRISE` automatically for those tiers.

---

## Required properties (every API VM)

All API VMs must share these characteristics:

| Requirement | Detail |
|-------------|--------|
| **Region / VPC** | Same **region** and **VPC** as Cloud SQL and Memorystore (`COLCOOR_GCP_REGION`, `COLCOOR_GCP_NETWORK` in `gcp.env`). All VMs in the **same zone** as `COLCOOR_GCP_ZONE` for the bundled load balancer script. |
| **OS** | Linux with long-term support (e.g. **Ubuntu 22.04 LTS**). |
| **Docker** | Docker Engine **24+** and **Docker Compose v2** plugin. |
| **Port 80** | nginx publishes **HTTP :80** for app traffic and Google load balancer health checks (`/health`, `/ready`). |
| **Network tag** | Must include **`COLCOOR_API_VM_TAG`** (default `colcoor-api`) for firewall and LB rules. |
| **Service account** | VM service account; Step 5 grants **`roles/storage.objectAdmin`** on the bucket named in `COLCOOR_GCS_BUCKET`. |
| **Private connectivity** | VM can reach Cloud SQL **private IP** and Memorystore **host:port** (no public Postgres/Redis). |
| **Disk** | Enough space for Docker images (~1–2 GiB loaded) and logs; **30 GiB+** boot disk recommended. |
| **Outbound** | HTTPS to GCS, Google APIs, and (for users) Cursor auth endpoints from **user desktops**, not necessarily from the VM. |

**Do not** run bundled Postgres or Redis on these VMs — database and cache are **Cloud SQL** and **Memorystore**.

---

## Example: create two small-tier VMs

Replace `YOUR_PROJECT`, region, and zone to match `gcp.env`:

```bash
gcloud compute instances create colcoor-api-1 colcoor-api-2 \
  --project=YOUR_PROJECT \
  --zone=us-central1-a \
  --machine-type=e2-standard-2 \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-balanced \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=colcoor-api,http-server \
  --scopes=https://www.googleapis.com/auth/cloud-platform
```

For **three** medium-tier VMs:

```bash
gcloud compute instances create colcoor-api-1 colcoor-api-2 colcoor-api-3 \
  --project=YOUR_PROJECT \
  --zone=us-central1-a \
  --machine-type=e2-standard-4 \
  --boot-disk-size=40GB \
  --boot-disk-type=pd-balanced \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=colcoor-api,http-server \
  --scopes=https://www.googleapis.com/auth/cloud-platform
```

Then install Docker on each VM: [Docker Engine install (Ubuntu)](https://docs.docker.com/engine/install/ubuntu/).

---

## Match `gcp.env` to your VMs

After choosing count and sizes, set **planned names** in **`gcp.env`** (before `create-shared-env.sh` — Step 5 creates these if missing):

```bash
COLCOOR_GCP_ZONE=us-central1-a          # same zone as all API VMs
COLCOOR_API_VM_INSTANCES=colcoor-api-1,colcoor-api-2
COLCOOR_API_VM_TAG=colcoor-api
COLCOOR_API_REPLICAS=2
WEB_CONCURRENCY=2
COLCOOR_CLOUDSQL_INSTANCE=colcoor-prod
COLCOOR_CLOUDSQL_TIER=db-custom-2-7680
COLCOOR_REDIS_INSTANCE=colcoor-redis
COLCOOR_GCS_BUCKET=your-project-colcoor-images
```

If you add a third VM later:

1. Create `colcoor-api-3` with the same tag, VPC, and SA pattern.
2. Append `colcoor-api-3` to `COLCOOR_API_VM_INSTANCES`.
3. Set `COLCOOR_API_REPLICAS=3`.
4. Re-run `./scripts/gcp/size-db-pools.sh --shared-env ./shared.env --api-replicas 3`.
5. Copy `shared.env` to the new VM and run `./scripts/deploy-replica.sh`.

---

## Quick validation checklist

- [ ] At least **2** API VMs in the **same zone** and **VPC** as managed services  
- [ ] **`COLCOOR_API_VM_INSTANCES`** lists every VM name  
- [ ] **`COLCOOR_API_REPLICAS`** equals that count  
- [ ] **`WEB_CONCURRENCY`** matches machine size (2 for `e2-standard-2`, 4 for `e2-standard-4`)  
- [ ] **Port 80** reachable from the load balancer and health-check ranges (firewall rules created with LB provisioning)  
- [ ] **`gcp.env`** lists planned names for Cloud SQL, Redis, and GCS (created in Step 5 if missing)

Next: return to **`README.md`** Step 1 (unpack bundle) and continue the deploy sequence.
