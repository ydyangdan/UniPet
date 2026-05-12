#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OVERLAY_DIR="$PROJECT_ROOT/overlay"
HERMES_HOME="${HERMES_HOME:-"$HOME/.hermes"}"
SOURCE_SKILL="$SCRIPT_DIR/skills/unipet"
TARGET_SKILLS="$HERMES_HOME/skills"
TARGET_SKILL="$TARGET_SKILLS/unipet"

if ! command -v unipet >/dev/null 2>&1; then
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "Node.js/npm was not found. Install Node.js first, then rerun this installer." >&2
    exit 1
  fi
  if [ ! -d "$OVERLAY_DIR/node_modules" ]; then
    (cd "$OVERLAY_DIR" && npm install)
  fi
  (cd "$OVERLAY_DIR" && npm link)
fi

if [ ! -d "$SOURCE_SKILL" ]; then
  echo "Source skill not found: $SOURCE_SKILL" >&2
  exit 1
fi

mkdir -p "$TARGET_SKILLS"
rm -rf "$TARGET_SKILL"
cp -R "$SOURCE_SKILL" "$TARGET_SKILL"

echo "Installed UniPet Hermes skill:"
echo "  $TARGET_SKILL"

if [ "${1:-}" != "--no-launch" ]; then
  unipet launch
fi

unipet status
