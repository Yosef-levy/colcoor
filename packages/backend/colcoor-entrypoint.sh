#!/bin/sh
# Ensure local image storage is writable by the app user (named volumes mount as root).
set -eu

STORAGE="${COLCOOR_LOCAL_IMAGE_STORAGE_PATH:-/var/lib/colcoor/images}"
mkdir -p "$STORAGE"
chown -R colcoor:colcoor "$STORAGE"

exec runuser -u colcoor -- "$@"
