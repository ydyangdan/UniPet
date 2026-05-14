#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$ROOT/plugin"
NO_START=0
NO_ENABLE=0
SKIP_VALIDATE=0
COPY=0
OPENCLAW_COMMAND="${OPENCLAW_COMMAND:-openclaw}"
UNIPET_COMMAND="${UNIPET_COMMAND:-unipet}"

for arg in "$@"; do
  case "$arg" in
    --no-start) NO_START=1 ;;
    --no-enable) NO_ENABLE=1 ;;
    --skip-validate) SKIP_VALIDATE=1 ;;
    --copy) COPY=1 ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: ./connectors/openclaw/install.sh [--no-start] [--no-enable] [--skip-validate] [--copy]" >&2
      exit 1
      ;;
  esac
done

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "OpenClaw plugin directory not found: $PLUGIN_DIR" >&2
  exit 1
fi

if ! command -v "$OPENCLAW_COMMAND" >/dev/null 2>&1; then
  echo "OpenClaw command was not found. Install OpenClaw or set OPENCLAW_COMMAND." >&2
  exit 1
fi

echo "Installing UniPet OpenClaw plugin from $PLUGIN_DIR"
install_args=(plugins install)
if [ "$COPY" -eq 0 ]; then
  install_args+=("-l")
fi
install_args+=("$PLUGIN_DIR")
"$OPENCLAW_COMMAND" "${install_args[@]}"

if [ "$NO_ENABLE" -eq 0 ]; then
  echo "Enabling unipet-openclaw"
  "$OPENCLAW_COMMAND" plugins enable unipet-openclaw
fi

if [ "$SKIP_VALIDATE" -eq 0 ]; then
  echo "Validating OpenClaw config"
  "$OPENCLAW_COMMAND" config validate
fi

if [ "$NO_START" -eq 0 ]; then
  if command -v "$UNIPET_COMMAND" >/dev/null 2>&1; then
    echo "Starting UniPet"
    "$UNIPET_COMMAND" start
  else
    echo "UniPet command was not found on PATH. Run 'unipet start' after installing the UniPet runtime." >&2
  fi
fi

echo "UniPet OpenClaw plugin is installed. Restart OpenClaw Gateway so startup hooks are loaded."
