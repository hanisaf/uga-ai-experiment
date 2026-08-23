#!/usr/bin/env bash
#
# deploy.sh — Deploy the AI Screening Terminal to Firebase Hosting.
#
# Deploys only the Hosting target defined in firebase.json (which serves the
# project root: index.html, survey.html, assets/).
#
# Usage:
#   ./scripts/deploy.sh                 # deploy live to the default project
#   ./scripts/deploy.sh --preview       # deploy to a temporary preview channel
#   ./scripts/deploy.sh --preview NAME  # preview channel with a custom name
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- Preconditions --------------------------------------------------------
if ! command -v firebase >/dev/null 2>&1; then
  echo "Error: the Firebase CLI is not installed." >&2
  echo "Install it with:  npm install -g firebase-tools" >&2
  exit 1
fi

if [ ! -f "firebase.json" ] || [ ! -f ".firebaserc" ]; then
  echo "Error: firebase.json / .firebaserc not found in $ROOT_DIR." >&2
  echo "Run 'firebase init hosting' first (or check you are in the right folder)." >&2
  exit 1
fi

if [ ! -f "survey.html" ] || [ ! -f "assets/scenarios.json" ]; then
  echo "Error: site files (survey.html, assets/scenarios.json) are missing." >&2
  exit 1
fi

# --- Deploy ---------------------------------------------------------------
if [ "${1:-}" = "--preview" ]; then
  CHANNEL="${2:-preview}"
  echo "Deploying to Firebase Hosting PREVIEW channel: ${CHANNEL}"
  echo "(temporary URL, does not touch the live site)"
  echo
  exec firebase hosting:channel:deploy "$CHANNEL"
else
  echo "Deploying to Firebase Hosting (LIVE)…"
  echo
  exec firebase deploy --only hosting
fi
