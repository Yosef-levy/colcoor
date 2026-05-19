# Colcoor release quick-start

For a first external install from the self-host release bundle.

## 0. Unpack (use the tarball)

**Recommended:** ship and extract the **`.tar.gz`** next to the bundle folder (created by `npm run bundle:release`). It preserves executable bits on `scripts/*.sh`.

```bash
sha256sum -c colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz.sha256
tar -xzf colcoor-enterprise-BE0.1.0-EXT0.0.1.tar.gz
cd colcoor-enterprise-BE0.1.0-EXT0.0.1
sha256sum -c SHA256SUMS
```

**Avoid** distributing a **zip** of the bundle folder — many tools (including default zip on Windows and some Linux unzip flows) **do not preserve `+x`** on shell scripts, and `./scripts/00-load-image.sh` will fail with `Permission denied`.

If you already extracted from zip (or scripts are not executable):

```bash
bash scripts/ensure-executable.sh
# or:
chmod +x scripts/*.sh pgbouncer/docker-entrypoint.sh
```

## 1. Load images (offline / air-gapped)

```bash
./scripts/00-load-image.sh
```

## 2. Configure secrets

```bash
./scripts/01-setup-env.sh
# Archive credentials.generated.txt, then remove from the server if required.
```

Or manually: `cp .env.example .env` and run `./scripts/generate-self-host-secrets.sh >> .env`.

## 3. Start the stack

```bash
./scripts/02-stack-up.sh
./scripts/05-health-check.sh
```

API base URL (extension setting): `http://<host>:8080` (default nginx port).

## 4. Install the extension

**Cursor:** Extensions view → `…` → **Install from VSIX…** → select `colcoor-extension-0.0.1.vsix` → reload window.

**VS Code:** Extensions → `…` → **Install from VSIX…** (same file).

## 5. Point the extension at your API

Settings → search `colcoor.backendBaseUrl` → set to your origin, e.g. `http://localhost:8080` (no trailing slash).

## 6. Sign in and try the product

1. Colcoor sidebar → **Sign in** (same account type as Cursor).
2. **Add conversation** → send a message.
3. **Conversation → Invite collaborator…** (invitees must sign in once before you can add them).
4. Open **side chat** when two or more members are present.

## More help

- [self-host.md](self-host.md) — troubleshooting
- [release-smoke-test.md](release-smoke-test.md) — full checklist
- [release-versions.md](release-versions.md) — version pairing
