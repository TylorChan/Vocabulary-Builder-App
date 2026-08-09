#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/vocabularyBackend"
MARK1_DIR="$ROOT/Mark1"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

# Load env in precedence order (later overrides earlier)
load_env_file "$MARK1_DIR/.env"
load_env_file "$BACKEND_DIR/.env"
load_env_file "$BACKEND_DIR/.env.local"

configure_mongodb_socks_proxy() {
  if [[ "${MARK2_DISABLE_SYSTEM_PROXY:-}" == "1" ]]; then
    return
  fi

  if [[ "${MONGODB_URI:-}" == *"proxyHost="* ]]; then
    return
  fi

  local proxy_host="${MONGODB_SOCKS_HOST:-}"
  local proxy_port="${MONGODB_SOCKS_PORT:-}"

  if [[ -z "$proxy_host" || -z "$proxy_port" ]]; then
    if ! command -v scutil >/dev/null 2>&1; then
      return
    fi

    local proxy_info socks_enable
    proxy_info="$(scutil --proxy 2>/dev/null || true)"
    socks_enable="$(awk '/SOCKSEnable/ { print $3; exit }' <<<"$proxy_info")"
    if [[ "$socks_enable" != "1" ]]; then
      return
    fi
    proxy_host="$(awk '/SOCKSProxy/ { print $3; exit }' <<<"$proxy_info")"
    proxy_port="$(awk '/SOCKSPort/ { print $3; exit }' <<<"$proxy_info")"
  fi

  if [[ -z "$proxy_host" || ! "$proxy_port" =~ ^[0-9]+$ ]]; then
    echo "[WARN] Ignoring invalid MongoDB SOCKS proxy configuration"
    return
  fi

  local separator="?"
  if [[ "$MONGODB_URI" == *"?"* ]]; then
    separator="&"
  fi
  export MONGODB_URI="${MONGODB_URI}${separator}proxyHost=${proxy_host}&proxyPort=${proxy_port}"
  echo "[INFO] Spring MongoDB SOCKS proxy: ${proxy_host}:${proxy_port}"
}

# Compatibility mapping: allow reuse of Mark1 env keys
if [[ -z "${MONGODB_URI:-}" && -n "${MONGO_URI:-}" ]]; then
  export MONGODB_URI="$MONGO_URI"
fi
if [[ -z "${MONGODB_DATABASE:-}" && -n "${MONGODB_ATLAS_DB_NAME:-}" ]]; then
  export MONGODB_DATABASE="$MONGODB_ATLAS_DB_NAME"
fi
if [[ -z "${FSRS_BASE_URL:-}" ]]; then
  export FSRS_BASE_URL="http://localhost:${FSRS_PORT:-6060}"
fi

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "[ERROR] MONGODB_URI is not set."
  echo "Set it in one of:"
  echo "  - $BACKEND_DIR/.env.local (recommended)"
  echo "  - $BACKEND_DIR/.env"
  echo "  - $MARK1_DIR/.env"
  exit 1
fi

configure_mongodb_socks_proxy

echo "[RUN] Spring Boot with external MongoDB config"
cd "$BACKEND_DIR"
exec ./gradlew bootRun
