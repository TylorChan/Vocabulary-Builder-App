#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARK1="$ROOT/Mark1"
BACKEND="$ROOT/vocabularyBackend"
FSRS="$ROOT/vocabularyBackend/fsrs-service"

if [[ "${1:-}" == "--vscode-task" ]]; then
  osascript <<'APPLESCRIPT' >/dev/null
  tell application "Visual Studio Code"
    activate
  end tell
  delay 0.8
  tell application "System Events"
    keystroke "b" using {command down, shift down}
  end tell
APPLESCRIPT
  echo "Triggered default task in current VS Code window: MARK II: Start All"
  exit 0
fi

open_terminal() {
  local title="$1"
  local cmd="$2"

  osascript - "$title" "$cmd" <<'APPLESCRIPT' >/dev/null
on run argv
  set tabTitle to item 1 of argv
  set runCmd to item 2 of argv
  tell application "Terminal"
    activate
    do script "echo '=== " & tabTitle & " ==='; " & runCmd
  end tell
end run
APPLESCRIPT
}

for port in 3000 3002 3003 8080 6060; do
  bash "$ROOT/scripts/run-with-port-clean.sh" "$port"
done

open_terminal "MARK1 Frontend Watch" "cd $MARK1; npm run watch"
open_terminal "MARK1 Server 3000" "cd $MARK1; node server.js"
open_terminal "MARK1 Voice Server 3002" "cd $MARK1; node voiceServer.js"
open_terminal "MARK1 Memory Server 3003" "cd $MARK1/memory; node memoryServer.js"
open_terminal "Spring Boot 8080" "bash $ROOT/scripts/run-spring-boot.sh"
open_terminal "FSRS Service 6060" "cd $FSRS; PORT=6060 bash $ROOT/scripts/run-fsrs.sh"

echo "Launched 6 Terminal windows for MARK II dev stack."
