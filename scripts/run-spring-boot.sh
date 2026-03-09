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

echo "[RUN] Spring Boot with external MongoDB config"
cd "$BACKEND_DIR"
exec ./gradlew bootRun
