#!/usr/bin/env bash
# Create HTTP(S) load balancer targeting Colcoor API VMs (nginx :80, /ready health check).
#
# Usage:
#   ./scripts/gcp/provision-load-balancer.sh --config scripts/gcp/gcp.env
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

CONFIG=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: provision-load-balancer.sh --config gcp.env [--dry-run]

Requires COLCOOR_API_VM_INSTANCES (comma-separated GCE names in COLCOOR_GCP_ZONE).
Tags VMs with COLCOOR_API_VM_TAG and opens health-check firewall rule.
Prints the LB IP when done.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config=*)
      CONFIG="${1#*=}"
      shift
      ;;
    --config)
      CONFIG="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      gcp_die "unknown argument: $1"
      ;;
  esac
done

gcp_load_config "$CONFIG"
gcp_require_gcloud

LB_NAME="${COLCOOR_LB_NAME:-colcoor-api-lb}"
IG_NAME="${COLCOOR_LB_INSTANCE_GROUP:-colcoor-api-ig}"
HC_NAME="${COLCOOR_LB_HEALTH_CHECK:-colcoor-ready-hc}"
BS_NAME="${COLCOOR_LB_BACKEND_SERVICE:-colcoor-api-backend}"
URL_MAP="${COLCOOR_LB_URL_MAP:-colcoor-api-map}"
PROXY_NAME="${COLCOOR_LB_HTTP_PROXY:-colcoor-api-http-proxy}"
RULE_NAME="${COLCOOR_LB_FORWARDING_RULE:-colcoor-api-http-rule}"
FW_NAME="${COLCOOR_LB_FIREWALL:-colcoor-allow-lb-health}"
VM_TAG="${COLCOOR_API_VM_TAG:-colcoor-api}"

[[ -n "${COLCOOR_API_VM_INSTANCES:-}" ]] || gcp_die "COLCOOR_API_VM_INSTANCES is required"

IFS=',' read -r -a VMS <<<"${COLCOOR_API_VM_INSTANCES}"

gcp_run gcloud config set project "$COLCOOR_GCP_PROJECT" >/dev/null

# Tag instances for health-check firewall.
for vm in "${VMS[@]}"; do
  vm="$(echo "$vm" | xargs)"
  [[ -n "$vm" ]] || continue
  echo "Tagging ${vm} with ${VM_TAG}..."
  gcp_run gcloud compute instances add-tags "$vm" \
    --zone="$COLCOOR_GCP_ZONE" --project="$COLCOOR_GCP_PROJECT" \
    --tags="$VM_TAG"
done

if ! gcloud compute firewall-rules describe "$FW_NAME" --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1; then
  echo "Creating firewall ${FW_NAME} (Google health check ranges → :80)..."
  gcp_run gcloud compute firewall-rules create "$FW_NAME" \
    --project="$COLCOOR_GCP_PROJECT" \
    --network="$COLCOOR_GCP_NETWORK" \
    --direction=INGRESS \
    --action=ALLOW \
    --target-tags="$VM_TAG" \
    --rules=tcp:80 \
    --source-ranges=130.211.0.0/22,35.191.0.0/16
fi

if ! gcloud compute health-checks describe "$HC_NAME" --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1; then
  echo "Creating health check ${HC_NAME} (/ready)..."
  gcp_run gcloud compute health-checks create http "$HC_NAME" \
    --project="$COLCOOR_GCP_PROJECT" \
    --port=80 \
    --request-path=/ready \
    --check-interval=30s \
    --timeout=10s \
    --unhealthy-threshold=3 \
    --healthy-threshold=2
fi

if ! gcloud compute instance-groups unmanaged describe "$IG_NAME" --zone="$COLCOOR_GCP_ZONE" --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1; then
  echo "Creating instance group ${IG_NAME}..."
  gcp_run gcloud compute instance-groups unmanaged create "$IG_NAME" \
    --zone="$COLCOOR_GCP_ZONE" --project="$COLCOOR_GCP_PROJECT"
fi

echo "Adding instances to ${IG_NAME}..."
gcp_run gcloud compute instance-groups unmanaged add-instances "$IG_NAME" \
  --zone="$COLCOOR_GCP_ZONE" --project="$COLCOOR_GCP_PROJECT" \
  --instances="$(echo "${COLCOOR_API_VM_INSTANCES}" | tr -d ' ')"

if ! gcloud compute backend-services describe "$BS_NAME" --global --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1; then
  echo "Creating backend service ${BS_NAME}..."
  gcp_run gcloud compute backend-services create "$BS_NAME" \
    --project="$COLCOOR_GCP_PROJECT" \
    --global \
    --protocol=HTTP \
    --health-checks="$HC_NAME" \
    --timeout=120s \
    --connection-draining-timeout=60
fi

# Idempotent: add-backend may fail if already attached — ignore.
gcp_run gcloud compute backend-services add-backend "$BS_NAME" \
  --project="$COLCOOR_GCP_PROJECT" \
  --global \
  --instance-group="$IG_NAME" \
  --instance-group-zone="$COLCOOR_GCP_ZONE" \
  --balancing-mode=UTILIZATION \
  --max-utilization=0.8 2>/dev/null || true

if ! gcloud compute url-maps describe "$URL_MAP" --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1; then
  gcp_run gcloud compute url-maps create "$URL_MAP" \
    --project="$COLCOOR_GCP_PROJECT" \
    --default-service="$BS_NAME"
fi

if ! gcloud compute target-http-proxies describe "$PROXY_NAME" --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1; then
  gcp_run gcloud compute target-http-proxies create "$PROXY_NAME" \
    --project="$COLCOOR_GCP_PROJECT" \
    --url-map="$URL_MAP"
fi

if ! gcloud compute forwarding-rules describe "$RULE_NAME" --global --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1; then
  gcp_run gcloud compute forwarding-rules create "$RULE_NAME" \
    --project="$COLCOOR_GCP_PROJECT" \
    --global \
    --target-http-proxy="$PROXY_NAME" \
    --ports=80
fi

if [[ "$DRY_RUN" == "1" ]]; then
  exit 0
fi

LB_IP="$(gcloud compute forwarding-rules describe "$RULE_NAME" \
  --global --project="$COLCOOR_GCP_PROJECT" \
  --format='value(IPAddress)')"
echo ""
echo "Load balancer ready."
echo "  IP: ${LB_IP}"
echo "  Health: GET http://${LB_IP}/ready"
echo "  Extension colcoor.backendBaseUrl: http://${LB_IP}"
