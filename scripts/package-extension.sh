#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARK1_DIR="$ROOT/Mark1"
DIST_DIR="$MARK1_DIR/dist"
ARTIFACTS_DIR="$ROOT/artifacts"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip command is required"
  exit 1
fi

if ! command -v shasum >/dev/null 2>&1; then
  echo "shasum command is required"
  exit 1
fi

echo "[1/3] Build extension"
cd "$MARK1_DIR"
npm run build

if [[ ! -f "$DIST_DIR/manifest.json" ]]; then
  echo "dist/manifest.json not found after build"
  exit 1
fi

VERSION="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$DIST_DIR/manifest.json','utf8'));process.stdout.write(m.version||'0.0.0')")"
ZIP_PATH="$ARTIFACTS_DIR/mark2-extension-v${VERSION}.zip"
SHA_PATH="$ARTIFACTS_DIR/mark2-extension-v${VERSION}.sha256"

mkdir -p "$ARTIFACTS_DIR"
rm -f "$ZIP_PATH" "$SHA_PATH"

echo "[2/3] Package zip"
cd "$DIST_DIR"
zip -r -X "$ZIP_PATH" . >/dev/null

echo "[3/3] Generate checksum"
shasum -a 256 "$ZIP_PATH" > "$SHA_PATH"

echo "Done"
echo "zip: $ZIP_PATH"
echo "sha256: $SHA_PATH"

