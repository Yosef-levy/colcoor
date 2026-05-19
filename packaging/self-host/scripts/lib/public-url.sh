# Shared helpers for self-host public HTTP URL (sourced by operator scripts).
# shellcheck shell=bash

colcoor_read_http_port() {
  local root="${1:?bundle root}"
  local port=80
  if [[ -f "$root/.env" ]]; then
    local line
    line="$(grep -E '^SELF_HOST_HTTP_PORT=' "$root/.env" | tail -1 || true)"
    if [[ -n "$line" ]]; then
      port="${line#SELF_HOST_HTTP_PORT=}"
    fi
  fi
  echo "$port"
}

colcoor_public_base_url() {
  local host="$1"
  local port="$2"
  if [[ "$port" == "80" ]]; then
    printf 'http://%s' "$host"
  else
    printf 'http://%s:%s' "$host" "$port"
  fi
}

colcoor_detect_vm_ip() {
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
  fi
  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [[ -n "$ip" && "$ip" != "127.0.0.1" ]]; then
    echo "$ip"
  fi
}
