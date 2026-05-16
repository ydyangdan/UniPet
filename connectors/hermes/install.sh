#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OVERLAY_DIR="$PROJECT_ROOT/overlay"
NO_START=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-start)
      NO_START=1
      shift
      ;;
    --hermes-home)
      if [ -z "${2:-}" ]; then
        echo "Missing value for --hermes-home" >&2
        exit 1
      fi
      HERMES_HOME="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: ./connectors/hermes/install.sh [--no-start] [--hermes-home path]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: ./connectors/hermes/install.sh [--no-start] [--hermes-home path]" >&2
      exit 1
      ;;
  esac
done

resolve_hermes_home_from_command() {
  local cmd_path
  cmd_path="$(command -v hermes 2>/dev/null || true)"
  if [ -z "$cmd_path" ] || [ ! -f "$cmd_path" ]; then
    return 0
  fi
  sed -nE "s/.*HERMES_HOME[[:space:]]*=[[:space:]]*[\"']?([^\"'[:space:]]+).*/\\1/p" "$cmd_path" | head -n 1
}

if [ -z "${HERMES_HOME:-}" ]; then
  HERMES_HOME="$(resolve_hermes_home_from_command)"
fi
HERMES_HOME="${HERMES_HOME:-"$HOME/.hermes"}"
SOURCE_SKILL="$SCRIPT_DIR/skills/unipet"
SOURCE_PLUGIN="$SCRIPT_DIR/plugins/unipet"
TARGET_SKILLS="$HERMES_HOME/skills"
TARGET_SKILL="$TARGET_SKILLS/unipet"
TARGET_PLUGINS="$HERMES_HOME/plugins"
TARGET_PLUGIN="$TARGET_PLUGINS/unipet"

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
if [ ! -d "$SOURCE_PLUGIN" ]; then
  echo "Source plugin not found: $SOURCE_PLUGIN" >&2
  exit 1
fi

mkdir -p "$TARGET_SKILLS"
mkdir -p "$TARGET_PLUGINS"
rm -rf "$TARGET_SKILL"
rm -rf "$TARGET_PLUGIN"
cp -R "$SOURCE_SKILL" "$TARGET_SKILL"
cp -R "$SOURCE_PLUGIN" "$TARGET_PLUGIN"

echo "Installed UniPet Hermes skill:"
echo "  $TARGET_SKILL"
echo "Installed UniPet Hermes plugin:"
echo "  $TARGET_PLUGIN"

if command -v hermes >/dev/null 2>&1; then
  if ! HERMES_HOME="$HERMES_HOME" hermes plugins enable unipet; then
    echo "Warning: could not auto-enable Hermes plugin 'unipet'. Run 'hermes plugins enable unipet' manually." >&2
  fi
else
  echo "Warning: hermes command not found. Plugin was copied but not auto-enabled." >&2
fi

if [ "$NO_START" -eq 0 ]; then
  unipet start
fi

unipet status
