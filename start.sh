#!/usr/bin/env bash
# TaskFlow dev startup.
# Usage: ./start.sh            — install deps if needed, start dev server, open browser
#        ./start.sh --build    — production build + preview server instead

set -euo pipefail
cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found — install Node.js first: https://nodejs.org"
  exit 1
fi

# Install dependencies on first run or when the lockfile changed since the
# last install.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "▶ Installing dependencies…"
  npm install
  touch node_modules
fi

if [ "${1:-}" = "--build" ]; then
  echo "▶ Building production bundle…"
  npm run build
  echo "▶ Serving production preview…"
  exec npm run preview -- --open
fi

echo "▶ Starting TaskFlow dev server…"
# --open launches the browser at whatever port Vite actually binds
# (it auto-bumps 5173 → 5174… when the port is busy).
exec npm run dev -- --open
