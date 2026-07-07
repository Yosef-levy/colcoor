# Release version pairing

Backend and extension versions are **independent semver** but must be **paired in one bundle folder** so customers install matching artifacts.

## Bundle directory name

```
colcoor-gcp-production-BE<backend-version>-EXT<extension-version>/
```

Example: `colcoor-gcp-production-BE0.1.0-EXT0.0.1/`

Version sources:

- Backend: `packages/backend/pyproject.toml` → `[project].version`
- Extension: `packages/extension/package.json` → `"version"`

## Contents

| Artifact | Name |
|----------|------|
| Backend image tarball | `colcoor-backend-<backend-version>.tar.gz` |
| PgBouncer image tarball | `colcoor-pgbouncer-1.23.1.tar.gz` |
| Extension | `colcoor-extension-<extension-version>.vsix` |
| Operator docs | `README.md` (only customer-facing doc) |

Install the **VSIX** and load the **backend image** from the **same** bundle folder.

## Build commands

```bash
npm run bundle:gcp-production
npm run validate:release
```

Ship **`colcoor-gcp-production-BE…-EXT….tar.gz`** (+ `.sha256`), not a zip of the folder.
