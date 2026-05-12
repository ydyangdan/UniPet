#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_HOME="${HERMES_HOME:-"$HOME/.hermes"}"
SOURCE_SKILL="$SCRIPT_DIR/skills/unipet"
TARGET_SKILLS="$HERMES_HOME/skills"
TARGET_SKILL="$TARGET_SKILLS/unipet"

if ! command -v unipet >/dev/null 2>&1; then
  echo "The 'unipet' command was not found. Run 'python -m pip install -e .' from the UniPet project root first." >&2
  exit 1
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
