# Enterprise IT handoff checklist — Colcoor

Send this to **security**, **network**, **identity**, and **endpoint management** before users install the Colcoor extension. Copy the blocks below into your ticket or runbook.

**Related:** [production.md](production.md) (full stack deploy, release + enterprise bundle), [authentication.md](authentication.md) (Cursor sign-in → JWT).

---

## 0. Deliverable bundle (optional)

From your build machine (repo root, Docker required):

```bash
npm run bundle:enterprise
```

On a host that has Docker but **not** a full Node extension build (no `tsc`), use **`npm run bundle:enterprise:skip-vsix`** and ship the `.vsix` from a dev machine separately (the bundle will include `EXTENSION_VSIX_NOT_INCLUDED.txt`).

Ship **`dist/colcoor-enterprise-BE…-EXT…/`** (zip it if you like) to the customer. It includes the **pre-built backend image tarball**, **extension `.vsix`** (unless skipped), **Compose + nginx**, and **scripts** that generate random `POSTGRES_PASSWORD` / `JWT_SECRET`, write `DATABASE_URL` into `.env`, and bring the stack up or down. Operator steps: `README.customer.txt` inside the bundle.

**Claude Desktop extension (`.dxt`)** is not yet part of `bundle:enterprise`. Build it separately when the customer needs it:

```bash
cd packages/claude_extension
npm install
npm run package     # → build/colcoor-claude-extension-<version>.dxt
```

Then ship the `.dxt` alongside the enterprise folder. See [`packages/claude_extension/README.md`](../packages/claude_extension/README.md) for install steps in Claude Desktop.

---

## 1. What you are hosting

| Item | Notes |
|------|--------|
| **Colcoor API** | FastAPI app behind **nginx** in production; clients use **`/api/v1/...`**. |
| **PostgreSQL** | Application data; not exposed publicly in the reference Compose layout. |
| **Cursor / VS Code extension** | Runs on **user machines** (Cursor/VS Code); talks to **your** API origin only. |
| **Claude Desktop extension** *(optional)* | Same backend, different client: a DXT-packaged MCP server distributed as `.dxt`. Runs on **user machines** inside Claude Desktop; talks to **your** API origin only. |

There is **no required cloud control plane** for Colcoor in this deployment model.

---

## 2. Backend URL (required before the extension works)

Each client has **no default** backend URL. Configure one per client:

| Client | Method | Where | Example value |
|--------|--------|--------|-----------------|
| Cursor / VS Code extension | **Settings (recommended)** | Managed Cursor/VS Code policy | `colcoor.backendBaseUrl` = `https://api.company.example` |
| Cursor / VS Code extension | **Environment variable** | Process env where the editor starts | `COLCOOR_API_URL=https://api.company.example` |
| Claude Desktop extension | **DXT user-config** | Claude Desktop **Settings → Extensions → Colcoor** form (declared in `manifest.json`) | `COLCOOR_BACKEND_URL=https://api.company.example` |

**URL rules:** origin only — `https` + host + optional port. **No path**, **no trailing slash**. Every client appends `/api/v1` itself.

After the URL is set or changed:

- **Cursor / VS Code:** users should **reload the window** (**Developer: Reload Window** in the Command Palette) so the extension picks up the new value.
- **Claude Desktop:** updating the user-config form re-spawns the MCP server automatically; no manual reload required.

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
2. Push **`colcoor.backendBaseUrl`** (or **`COLCOOR_API_URL`**) via device or org policy for Cursor / VS Code users.
3. Distribute the **`.vsix`** or marketplace install per your software catalog.
4. *(Optional)* If you support Claude Desktop, distribute the **`.dxt`** built from `packages/claude_extension/`. Users install via **Claude Desktop → Settings → Extensions → Install from file…**, then fill in **`COLCOOR_BACKEND_URL`** (and either `COLCOOR_API_TOKEN` or `COLCOOR_CURSOR_ACCESS_TOKEN`) in the rendered form.
5. Pilot with a small group; confirm sign-in and first conversation create.

---

## 8. Support triage (first failures)

| Symptom | Client | Likely cause |
|---------|--------|----------------|
| Extension error: no backend URL configured | Cursor / VS Code | Missing `colcoor.backendBaseUrl` and `COLCOOR_API_URL`. |
| MCP server fails to start with "COLCOOR_BACKEND_URL is not set" | Claude Desktop | Empty backend-URL field in the DXT user-config form. |
| TLS / certificate errors | Either | Untrusted CA, hostname mismatch, or TLS interception. |
| 401 / auth failures | Cursor / VS Code | User not signed in in Cursor, blocked IdP, or clock skew. |
| Tool calls return `http_status: 401` in `structuredContent` | Claude Desktop | Empty / expired `COLCOOR_API_TOKEN`; have the user run `colcoor_sign_in_with_cursor` or update the user-config token. |
| Connection timeout | Either | Firewall, wrong host/port, or API not reachable from user network. |

Point engineers at [production.md](production.md) (client extensions remote API section) and [authentication.md](authentication.md).
