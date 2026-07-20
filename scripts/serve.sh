#!/usr/bin/env bash
#
# serve.sh — Run the AI Screening Terminal locally.
#
# The instrument fetches assets/scenarios.json at runtime, so it must be served
# over HTTP (opening the file directly as file:// hangs on "Loading case files…").
# This starts a static server from the project root.
#
# Usage:
#   ./scripts/serve.sh [PORT]      # default port 8731
#
set -euo pipefail

# Resolve the project root (parent of this scripts/ folder) so the script works
# no matter what directory it is called from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${1:-8731}"
URL="http://localhost:${PORT}/"

cd "$ROOT_DIR"

if [ ! -f "survey.html" ] || [ ! -f "assets/scenarios.json" ]; then
  echo "Error: expected survey.html and assets/scenarios.json in $ROOT_DIR" >&2
  exit 1
fi

echo "Serving $ROOT_DIR"
echo "  Landing page : ${URL}"
echo "  Instrument   : ${URL}survey.html"
echo "  Stop with Ctrl+C"
echo

# Try to open a browser (macOS 'open', Linux 'xdg-open'); ignore if unavailable.
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi ) >/dev/null 2>&1 &

# Prefer python3; fall back to python.
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT"
else
  echo "Error: python3 (or python) is required to run the local server." >&2
  echo "Alternatively run any static server from $ROOT_DIR, e.g.: npx serve" >&2
  exit 1
fi
