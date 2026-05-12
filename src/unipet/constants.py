"""Minimal path helpers for the standalone UniPet package."""

from __future__ import annotations

import os
from pathlib import Path


def get_unipet_home() -> Path:
    """Resolve the UniPet state/data directory."""
    value = os.environ.get("UNIPET_HOME", "").strip()
    return Path(value) if value else Path.home() / ".unipet"


def get_hermes_home() -> Path | None:
    """Try to find the Hermes Agent home directory for runtime integration."""
    value = os.environ.get("HERMES_HOME", "").strip()
    if value:
        return Path(value)
    default = Path.home() / ".hermes"
    return default if default.exists() else None


DEFAULT_BRIDGE_HOST = "127.0.0.1"
DEFAULT_BRIDGE_PORT = 8768
DEFAULT_WS_PORT = 8769
RUNTIME_FILENAME = "pet_runtime.json"
