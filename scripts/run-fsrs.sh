#!/usr/bin/env bash
set -euo pipefail

# Run from vocabularyBackend/fsrs-service as cwd.
if [[ ! -f "app.py" || ! -f "requirements.txt" ]]; then
  echo "[ERROR] run-fsrs.sh must be run in vocabularyBackend/fsrs-service"
  exit 1
fi

VENV_DIR=".venv"
PYTHON_BIN="python3"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "[ERROR] python3 not found."
  exit 1
fi

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "[SETUP] Creating FSRS virtualenv at ${VENV_DIR}"
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

if ! python -c "import flask, flask_cors, fsrs" >/dev/null 2>&1; then
  echo "[SETUP] Installing FSRS dependencies from requirements.txt"
  python -m pip install --upgrade pip
  python -m pip install -r requirements.txt
fi

echo "[RUN] FSRS service on port ${PORT:-6060}"
exec python app.py

