#!/usr/bin/env bash
# Shared helpers for Colcoor GCP provisioning scripts.
set -euo pipefail

gcp_die() {
  echo "gcp: $*" >&2
  exit 1
}

gcp_require_cmd() {
  local cmd=$1
  command -v "$cmd" >/dev/null 2>&1 || gcp_die "${cmd} is required"
}

gcp_require_gcloud() {
  gcp_require_cmd gcloud
  gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q . \
    || gcp_die "no active gcloud account; run: gcloud auth login"
}

gcp_load_config() {
  local config_file=${1:-}
  if [[ -n "$config_file" && -f "$config_file" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$config_file"
    set +a
  fi
  COLCOOR_GCP_PROJECT="${COLCOOR_GCP_PROJECT:-${GCP_PROJECT:-}}"
  COLCOOR_GCP_REGION="${COLCOOR_GCP_REGION:-${GCP_REGION:-us-central1}}"
  COLCOOR_GCP_ZONE="${COLCOOR_GCP_ZONE:-${COLCOOR_GCP_REGION}-a}"
  COLCOOR_GCP_NETWORK="${COLCOOR_GCP_NETWORK:-default}"
  [[ -n "$COLCOOR_GCP_PROJECT" ]] || gcp_die "COLCOOR_GCP_PROJECT is required (set in gcp.env or --config)"
}

gcp_run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[dry-run] $*"
    return 0
  fi
  "$@"
}

gcp_urlencode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

# Idempotent set KEY=VALUE in env file (preserves other lines, updates or appends).
gcp_env_set() {
  local file=$1 key=$2 value=$3
  local tmp="${file}.tmp"
  umask 077
  if [[ ! -f "$file" ]]; then
    mkdir -p "$(dirname "$file")"
    touch "$file"
    chmod 600 "$file" 2>/dev/null || true
  fi
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$value" 'BEGIN { FS="=" } $1 == k { print k "=" v; next } { print }' "$file" >"$tmp"
  else
    cat "$file" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  mv "$tmp" "$file"
  chmod 600 "$file" 2>/dev/null || true
}

gcp_env_set_if_missing() {
  local file=$1 key=$2 value=$3
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    return 0
  fi
  gcp_env_set "$file" "$key" "$value"
}

gcp_random_hex() {
  local bytes=${1:-32}
  openssl rand -hex "$bytes"
}

gcp_instance_exists() {
  local kind=$1 name=$2
  case "$kind" in
    cloudsql)
      gcloud sql instances describe "$name" --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1
      ;;
    redis)
      gcloud redis instances describe "$name" --region="$COLCOOR_GCP_REGION" --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1
      ;;
    bucket)
      gcloud storage buckets describe "gs://${name}" --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

gcp_vm_service_account() {
  local vm=$1 zone=${2:-$COLCOOR_GCP_ZONE}
  gcloud compute instances describe "$vm" --zone="$zone" --project="$COLCOOR_GCP_PROJECT" \
    --format='value(serviceAccounts[0].email)' 2>/dev/null || true
}
