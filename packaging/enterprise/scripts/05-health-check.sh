#!/usr/bin/env bash
# Curl health endpoints on localhost (through published nginx port).
set -euo pipefail

BASE="${COLCOOR_HEALTH_BASE:-http://127.0.0.1}"

echo "GET $BASE/health"
curl -fsS "$BASE/health" && echo ""

echo "GET $BASE/ready"
curl -fsS "$BASE/ready" && echo ""

echo "GET $BASE/api/v1/health"
curl -fsS "$BASE/api/v1/health" && echo ""

echo "All checks OK."
