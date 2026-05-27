# Release quickstart (repo maintainers)

Build and smoke-test the **GCP production** customer bundle before handoff.

## Build

```bash
npm run test
npm run bundle:gcp-production
```

`bundle:gcp-production` runs **`validate:release`** (required files, no legacy scripts, tarball extract + executable bits).

## Verify archive

```bash
cd dist
sha256sum -c colcoor-gcp-production-BE0.1.0-EXT0.0.1.tar.gz.sha256
tar -xzf colcoor-gcp-production-BE0.1.0-EXT0.0.1.tar.gz
cd colcoor-gcp-production-BE0.1.0-EXT0.0.1
./scripts/00-load-images.sh   # requires Docker + image tarballs in bundle
```

Full operator path for customers is **`README.md`** inside the bundle (not this doc).

## Related

- [enterprise-handoff-checklist.md](enterprise-handoff-checklist.md)
- [release-smoke-test.md](release-smoke-test.md)
- [release-versions.md](release-versions.md)
- [packaging/gcp-production/README.md](../packaging/gcp-production/README.md) — source for bundle README
