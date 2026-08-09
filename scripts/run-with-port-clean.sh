#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <port> [command...]"
  exit 1
fi

PORT="$1"
shift

configure_node_proxy() {
  if [[ "${MARK2_DISABLE_SYSTEM_PROXY:-}" == "1" ]]; then
    return
  fi

  if [[ "${1:-}" != "node" && "${1:-}" != "npm" && "${1:-}" != "npx" ]]; then
    return
  fi

  if ! command -v scutil >/dev/null 2>&1; then
    return
  fi

  local proxy_info https_enable https_host https_port http_enable http_host http_port
  local socks_enable socks_host socks_port proxy_url
  proxy_info="$(scutil --proxy 2>/dev/null || true)"
  https_enable="$(awk '/HTTPSEnable/ { print $3; exit }' <<<"$proxy_info")"
  https_host="$(awk '/HTTPSProxy/ { print $3; exit }' <<<"$proxy_info")"
  https_port="$(awk '/HTTPSPort/ { print $3; exit }' <<<"$proxy_info")"
  http_enable="$(awk '/HTTPEnable/ { print $3; exit }' <<<"$proxy_info")"
  http_host="$(awk '/HTTPProxy/ { print $3; exit }' <<<"$proxy_info")"
  http_port="$(awk '/HTTPPort/ { print $3; exit }' <<<"$proxy_info")"
  socks_enable="$(awk '/SOCKSEnable/ { print $3; exit }' <<<"$proxy_info")"
  socks_host="$(awk '/SOCKSProxy/ { print $3; exit }' <<<"$proxy_info")"
  socks_port="$(awk '/SOCKSPort/ { print $3; exit }' <<<"$proxy_info")"
  proxy_url=""

  if [[ "$https_enable" == "1" && -n "$https_host" && -n "$https_port" ]]; then
    proxy_url="http://${https_host}:${https_port}"
  elif [[ "$http_enable" == "1" && -n "$http_host" && -n "$http_port" ]]; then
    proxy_url="http://${http_host}:${http_port}"
  fi

  if [[ -z "$proxy_url" && ( "$socks_enable" != "1" || -z "$socks_host" || -z "$socks_port" ) ]]; then
    return
  fi

  if [[ -n "$proxy_url" ]]; then
    export HTTP_PROXY="${HTTP_PROXY:-$proxy_url}"
    export HTTPS_PROXY="${HTTPS_PROXY:-$proxy_url}"
    export ALL_PROXY="${ALL_PROXY:-$proxy_url}"
    export NO_PROXY="${NO_PROXY:-127.0.0.1,localhost,::1}"
    case ",${NO_PROXY}," in
      *",api.deepseek.com,"*) ;;
      *) export NO_PROXY="${NO_PROXY},api.deepseek.com" ;;
    esac
  fi

  if [[ "$socks_enable" == "1" && -n "$socks_host" && -n "$socks_port" ]]; then
    export MONGODB_SOCKS_PROXY="${MONGODB_SOCKS_PROXY:-socks5://${socks_host}:${socks_port}}"
  fi

  if [[ -n "$proxy_url" ]] && command -v node >/dev/null 2>&1 && node --help 2>/dev/null | grep -q -- "--use-env-proxy"; then
    case " ${NODE_OPTIONS:-} " in
      *" --use-env-proxy "*) ;;
      *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--use-env-proxy" ;;
    esac
  fi

  if [[ -n "$proxy_url" ]]; then
    echo "[INFO] Node outbound proxy: ${HTTPS_PROXY}"
  fi
  if [[ -n "${MONGODB_SOCKS_PROXY:-}" ]]; then
    echo "[INFO] MongoDB SOCKS proxy: ${MONGODB_SOCKS_PROXY}"
  fi
}

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

configure_node_proxy "$@"

echo "[RUN] $*"
exec "$@"
