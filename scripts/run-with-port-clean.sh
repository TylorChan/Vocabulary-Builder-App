#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <port> [command...]"
  exit 1
fi

PORT="$1"
shift

if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null | sort -u || true)"
  if [[ -n "$PIDS" ]]; then
    echo "[INFO] Port ${PORT} in use by: ${PIDS}. Killing..."
    kill -TERM ${PIDS} 2>/dev/null || true
    sleep 1

    STILL="$(lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null | sort -u || true)"
    if [[ -n "$STILL" ]]; then
      kill -KILL ${STILL} 2>/dev/null || true
      sleep 0.5
    fi
  fi
fi

if [[ $# -eq 0 ]]; then
  echo "[OK] Port ${PORT} is ready"
  exit 0
fi

echo "[RUN] $*"
exec "$@"
