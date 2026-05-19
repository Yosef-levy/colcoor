# Colcoor release quick-start

For a first external install from the self-host release bundle.

## Prerequisites

- Linux VM with **inbound TCP port 80** open (firewall / security group)
- Docker Engine + Docker Compose v2, `curl`, `openssl`

## 0. Unpack (use the tarball)

**Recommended:** ship and extract the **`.tar.gz`** (preserves executable bits on scripts).

```bash
sha256sum -c colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz.sha256
tar -xzf colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz
cd colcoor-enterprise-BE0.1.0-EXT0.0.1
sha256sum -c SHA256SUMS
```

If `./install-colcoor.sh` fails with `Permission denied` (common after zip extract):

```bash
bash scripts/ensure-executable.sh
```

## 1. Install (one command)

```bash
./install-colcoor.sh
```

This loads Docker images, creates `.env` and secrets if needed, starts the stack (nginx on **port 80**), runs health checks, and prints your URL (e.g. `http://203.0.113.10`).

## 2. Install the extension

**Cursor:** Extensions → `…` → **Install from VSIX…** → `colcoor-extension-0.0.1.vsix` → reload window.

See [install-vsix.md](install-vsix.md).

## 3. Point the extension at your API

Settings → **Colcoor: Backend base URL** → `http://<VM-public-ip>` (no trailing slash, **no `:8080`** on the default install).

Same machine as the VM: `http://localhost` is fine.

## 4. Sign in and try the product

1. Colcoor sidebar → **Sign in**
2. **Add conversation** → send a message
3. **Invite collaborator…** (invitees must sign in once first)
4. Open **side chat** with two or more members

## HTTPS

TLS and custom domain setup are **not** in this release. Plan for HTTP on port 80 for now; HTTPS support is next.

## Debug / advanced (optional)

Manual steps instead of `install-colcoor.sh`:

```bash
./scripts/00-load-image.sh
./scripts/01-setup-env.sh
./scripts/02-stack-up.sh
./scripts/05-health-check.sh
```

Use port **8080** instead of 80 (e.g. when port 80 is taken): set `SELF_HOST_HTTP_PORT=8080` in `.env` before `./scripts/02-stack-up.sh`, then use `http://<host>:8080` in the extension.

## More help

- [self-host.md](self-host.md) — operations and troubleshooting
- [release-smoke-test.md](release-smoke-test.md) — verification checklist
- [release-versions.md](release-versions.md) — version pairing
