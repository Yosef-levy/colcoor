# Release versions and compatibility

Colcoor ships as a **paired** backend (Docker) and extension (VSIX). Use matching versions from the same bundle directory.

## Current release

| Component | Version source | Example |
|-----------|----------------|---------|
| Backend API | `packages/backend/pyproject.toml` → `[project].version` | `0.1.0` |
| Extension | `packages/extension/package.json` → `version` | `0.0.1` |

## Bundle directory name

Release folders under `dist/` are named:

```text
colcoor-enterprise-BE<backend-version>-EXT<extension-version>/
```

Example: `colcoor-enterprise-BE0.1.0-EXT0.0.1/`

Contents are the same naming scheme for **enterprise** (GCS-oriented compose) and **self-host** (free tier compose) builds; only `docker-compose.yml` and docs differ.

## Compatibility rule

- Install the **VSIX** and **backend image** from the **same** `colcoor-enterprise-BE…-EXT…` folder.
- Do not mix a newer extension with an older API (or vice versa) unless release notes say otherwise.

## Docker image tags

After `docker load` from `colcoor-backend-*.tar.gz`:

- `colcoor-backend:<backend-version>` (e.g. `0.1.0`)
- `colcoor-backend:prod` (alias used by compose)
- `colcoor-pgbouncer:1.23.1`

Image ID is recorded in `MANIFEST.txt` when the bundle is built.

## When to bump versions

Bump **backend** and/or **extension** in their source files, rebuild the bundle, and publish new release notes. Keep both versions in the bundle name so support can identify mismatches quickly.
