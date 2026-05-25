# Conversation image storage (GCS)

User-uploaded images for `colcoor_user_media` (main thread and side chat) are stored in **object storage**, not PostgreSQL.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| **Postgres** `conversation_images` | `id`, `conversation_id`, `mime_type`, `byte_size`, `object_key`, `uploaded_by_user_id`, `created_at` |
| **GCS bucket** (production) | Bytes at `conversations/{conversation_id}/images/{image_id}` |
| **Local directory** (dev) | Same key layout under `COLCOOR_LOCAL_IMAGE_STORAGE_PATH` |
| **API** | AuthZ via membership; GCS reads use **signed URLs** (no bytes through API in production) |

Object keys use **server-generated UUIDv4** image ids only. Upload filenames from multipart forms are never used in `object_key`.

Backend workers are stateless: each request uses the shared bucket and ADC/service account credentials.

## Environment variables

| Variable | Production | Development |
|----------|------------|-------------|
| `GCS_BUCKET` / `COLCOOR_GCS_BUCKET` | **Required** | Optional |
| `COLCOOR_IMAGE_STORAGE` | `gcs` (or infer from bucket) | `local` default if bucket unset |
| `GCS_SIGNED_URL_TTL_SECONDS` | Optional (default **300** = 5 min, max 3600) | N/A for local |
| `COLCOOR_MAX_IMAGE_BYTES` | Optional (default **8388608** = 8 MiB, max 32 MiB) | Same |
| `COLCOOR_LOCAL_IMAGE_STORAGE_PATH` | N/A | Default `/tmp/colcoor-images` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account JSON path on GCP VM | Optional for local GCS testing |

Allowed MIME types (fixed): `image/png`, `image/jpeg`, `image/webp`, `image/gif`.

Startup fails in `COLCOOR_ENV=production` without `GCS_BUCKET` and gcs backend.

## API

| Method | AuthZ |
|--------|--------|
| `POST …/images` | **Owner or editor** (viewers forbidden) |
| `GET …/images/{id}` | Conversation member; **membership checked before** signed redirect |
| `DELETE …/images/{id}` | **Owner or editor** (viewers forbidden) |

Upload flow: validate size/MIME → upload blob → insert DB row. If DB insert fails, the blob is deleted.

Delete flow: remove DB row → delete blob. If blob delete fails, the API still returns **204** and logs an error (orphan blob; ops can reconcile).

## GCP VM deployment

### Bucket hardening

- **Do not make the bucket public.** Use uniform bucket-level access; do not grant `allUsers` or `allAuthenticatedUsers` `roles/storage.objectViewer`.
- **CORS on the bucket is not required** for the Colcoor extension: clients call the API with `Authorization: Bearer`; the API returns a **302** to a short-lived signed URL. The extension’s HTTP client follows the redirect to GCS. No browser-origin direct upload to GCS.
- Enable **uniform bucket-level access** and restrict access to the VM service account only.

### IAM (exact)

Attach a dedicated service account to the GCE VM (or use the default compute SA). Grant on the **image bucket** (bucket-level IAM is simplest):

| Role | Purpose |
|------|---------|
| **`roles/storage.objectAdmin`** | `storage.objects.create`, `get`, `delete` on objects in the bucket (upload, signed-url reads, delete) |

`roles/storage.objectAdmin` is sufficient for `google-cloud-storage` `blob.generate_signed_url()` when using that service account’s credentials (GCE metadata or JSON key).

**Tighter custom role** (optional): `storage.objects.create`, `storage.objects.get`, `storage.objects.delete` on resource `projects/_/buckets/BUCKET_NAME/objects/conversations/*`.

Do **not** grant `roles/storage.admin` on the project unless required for bucket creation; scope to the single bucket.

### Configure the VM

1. Create bucket — **or** run `./scripts/gcp/provision-gcs.sh --config scripts/gcp/gcp.env --shared-env ./shared.env` ([gcp-provisioning.md](gcp-provisioning.md)).
2. Set `.env`: `GCS_BUCKET=…`, `COLCOOR_IMAGE_STORAGE=gcs` (done automatically by the GCS script).
3. Optional: `COLCOOR_MAX_IMAGE_BYTES`, `GCS_SIGNED_URL_TTL_SECONDS`.
4. ADC on GCE uses the attached service account automatically.

## Local development

```bash
# No GCS — files under /tmp/colcoor-images
uvicorn colcoor_backend.app:create_app --factory

# Or point at a dev bucket:
export GCS_BUCKET=my-dev-bucket
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
```

## Orphan blobs

- DB insert failure after upload: API attempts immediate blob delete (see logs).
- DB delete success + blob delete failure: row gone, blob may remain until manual/GC cleanup.
- Conversation soft-delete does not purge GCS; use explicit `DELETE …/images/{id}` or a future prefix purge job.
