# Enterprise IT handoff checklist — Colcoor

Send this to **security**, **network**, **identity**, and **endpoint management** before users install the Colcoor extension. Copy the blocks below into your ticket or runbook.

**Related:** [production.md](production.md) (full stack deploy, release + enterprise bundle), [authentication.md](authentication.md) (Cursor sign-in → JWT).

---

## 0. Deliverable bundle (optional)

From your build machine (repo root, Docker required):

```bash
npm run bundle:enterprise
```

Ship **`dist/colcoor-enterprise-BE…-EXT…/`** (zip it if you like) to the customer. It includes the **pre-built backend image tarball**, **extension `.vsix`**, **Compose + nginx**, and **scripts** that generate random `POSTGRES_PASSWORD` / `JWT_SECRET`, write `DATABASE_URL` into `.env`, and bring the stack up or down. Operator steps: `README.customer.txt` inside the bundle.

---

## 1. What you are hosting

| Item | Notes |
|------|--------|
| **Colcoor API** | FastAPI app behind **nginx** in production; clients use **`/api/v1/...`**. |
| **PostgreSQL** | Application data; not exposed publicly in the reference Compose layout. |
| **Extension** | Runs on **user machines** (Cursor/VS Code); talks to **your** API origin only. |

There is **no required cloud control plane** for Colcoor in this deployment model.

---

## 2. Backend URL (required before the extension works)

The extension has **no default** backend URL. Each environment must set **one** of:

| Method | Where | Example value |
|--------|--------|-----------------|
| **Settings (recommended)** | Managed Cursor/VS Code policy | `colcoor.backendBaseUrl` = `https://api.company.example` |
| **Environment variable** | Process env where the editor starts | `COLCOOR_API_URL=https://api.company.example` |

**URL rules:** origin only — `https` + host + optional port. **No path**, **no trailing slash**. The extension adds `/api/v1` itself.

**Copy-paste — managed setting (JSON fragment):**

```json
{
  "colcoor.backendBaseUrl": "https://api.company.example"
}
```

**Copy-paste — shell env (Linux/macOS example):**

```bash
export COLCOOR_API_URL="https://api.company.example"
```

---

## 3. Network and TLS

- [ ] **DNS:** `api.company.example` (or your chosen hostname) resolves to the load balancer or VM fronting nginx.
- [ ] **Inbound:** allow **443** (and **80** only if you redirect to HTTPS) from networks where **Cursor runs** (office, VPN, WFH IPs as policy allows).
- [ ] **Certificate:** publicly trusted CA (e.g. Let’s Encrypt) so Node’s TLS stack in the extension host accepts the connection.
- [ ] **Health checks** (optional for your platform): `GET /health`, `GET /ready` (see [production.md](production.md)).

---

## 4. Identity and auth (high level)

- End users sign in with **the same account type they use in Cursor** (GitHub / Microsoft / Google, per extension flow).
- The backend exchanges a Cursor-related token for a **Colcoor JWT** via **`POST /api/v1/auth/cursor`** ([authentication.md](authentication.md)).
- [ ] Confirm **outbound HTTPS** from the API host to Cursor / IdP endpoints is allowed per your firewall (see backend env and auth doc for details).

---

## 5. Secrets and configuration (backend)

Use your secret store for production values; do not commit `.env`.

- [ ] **`JWT_SECRET`** — strong, unique per environment.
- [ ] **`DATABASE_URL`** — matches Postgres credentials and hostname on the internal network.
- [ ] **`CORS_ORIGINS`** — extension-only traffic often works with **empty** CORS; set explicit origins if **browser** clients call the API ([production.md](production.md)).

Full variable table: [production.md](production.md) § Environment variables.

---

## 6. Data and compliance (customer decision)

- [ ] **Data residency:** Postgres runs where you deploy it; document region and backup location.
- [ ] **Retention / purge:** backend supports configurable soft-delete and purge behavior ([production.md](production.md)).
- [ ] **Backups and restore drills:** `pg_dump` or volume snapshots per your policy.

---

## 7. Endpoint rollout order (suggested)

1. Deploy API + DB + nginx per [production.md](production.md); verify `/health` and `/ready`.
2. Push **`colcoor.backendBaseUrl`** (or **`COLCOOR_API_URL`**) via device or org policy.
3. Distribute the **`.vsix`** or marketplace install per your software catalog.
4. Pilot with a small group; confirm sign-in and first conversation create.

---

## 8. Support triage (first failures)

| Symptom | Likely cause |
|---------|----------------|
| Extension error: no backend URL configured | Missing `colcoor.backendBaseUrl` and `COLCOOR_API_URL`. |
| TLS / certificate errors | Untrusted CA, hostname mismatch, or TLS interception. |
| 401 / auth failures | User not signed in in Cursor, blocked IdP, or clock skew. |
| Connection timeout | Firewall, wrong host/port, or API not reachable from user network. |

Point engineers at [production.md](production.md) (extension remote API section) and [authentication.md](authentication.md).
