#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER="$ROOT/install.js"
NO_START=0
CONFIG_PATH=""
UNIPET_COMMAND="${UNIPET_COMMAND:-unipet}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-start)
      NO_START=1
      shift
      ;;
    --config)
      CONFIG_PATH="${2:-}"
      shift 2
      ;;
    --unipet-command)
      UNIPET_COMMAND="${2:-unipet}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: ./connectors/codex/install.sh [--no-start] [--config path] [--unipet-command unipet]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: ./connectors/codex/install.sh [--no-start] [--config path] [--unipet-command unipet]" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$INSTALLER" ]; then
  echo "Codex connector installer not found: $INSTALLER" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on PATH. Install Node.js 18+ before setting up UniPet." >&2
  exit 1
fi

args=("$INSTALLER")
if [ "$NO_START" -eq 1 ]; then
  args+=("--no-start")
fi
if [ -n "$CONFIG_PATH" ]; then
  args+=("--config" "$CONFIG_PATH")
fi
args+=("--unipet-command" "$UNIPET_COMMAND")

node "${args[@]}"
