#!/usr/bin/env bash
set -euo pipefail

# friends-app-for-ubuntu v1.0 release packaging script (.deb + .AppImage)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
echo "friends-app-for-ubuntu v${VERSION} release packager"

if [[ "${1:-}" == "--check" ]]; then
  echo "[check] Running static syntax, ID, and ESLint verification..."
  npm run check
  echo "[check] Verifying Electron & build scripts..."
  node -c scripts/build-deb.js
  node -c scripts/build-appimage.js
  node -c electron/main.js
  echo "[check] Packaging prerequisites verified for v${VERSION}."
  exit 0
fi

echo "[1/4] Verifying repository checks and test suite..."
npm run check

echo "[2/4] Building Ubuntu .deb package..."
npm run dist

echo "[3/4] Building Linux AppImage..."
npm run dist:appimage

echo "[4/4] Release artifacts in dist/:"
ls -lh dist/
