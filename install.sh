#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OVERLAY="$ROOT/overlay"
NO_START=0

for arg in "$@"; do
  case "$arg" in
    --no-start) NO_START=1 ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: ./install.sh [--no-start]" >&2
      exit 1
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 18+ first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js/npm first." >&2
  exit 1
fi

(cd "$OVERLAY" && npm install && npm link)

if [ "$NO_START" -eq 0 ]; then
  unipet start
fi

unipet doctor
