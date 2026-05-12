"""UniPet wire protocol — Codex Pet compatible data contracts.

This module is deliberately free of any side effects (no imports from CLI,
bridge, or UI layers) so the desktop overlay, CLI, and agent connectors can
share one event contract without pulling in unrelated dependencies.

Reference: Codex Pet 8x9 spritesheet standard
  - atlas: 1536 x 1872 px
  - cells: 8 columns x 9 rows, 192 x 208 px each
  - format: webp (or png), RGBA, transparent background
  - metadata: pet.json { id, displayName, description, spritesheetPath }
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Protocol version
# ---------------------------------------------------------------------------
PROTOCOL_VERSION = "unipet.v1"

# ---------------------------------------------------------------------------
# Codex spritesheet atlas constants (the canonical format)
# ---------------------------------------------------------------------------
CODEX_ATLAS_COLUMNS = 8
CODEX_ATLAS_ROWS = 9
CODEX_CELL_WIDTH = 192
CODEX_CELL_HEIGHT = 208
CODEX_ATLAS_WIDTH = CODEX_ATLAS_COLUMNS * CODEX_CELL_WIDTH   # 1536
CODEX_ATLAS_HEIGHT = CODEX_ATLAS_ROWS * CODEX_CELL_HEIGHT     # 1872

# ---------------------------------------------------------------------------
# Animation row mapping (Codex convention — implicit, not in pet.json)
#
# Each row of the 8×9 spritesheet is a distinct animation state.
# The frame count and FPS are fixed by convention.
# ---------------------------------------------------------------------------
PIXEL_GAP = 0    # reserved space between cells in the spritesheet

ANIMATION_ROWS: dict[str, dict[str, Any]] = {
    # row  state           frames  fps   loop    notes
    0:  ("idle",          6,      6,    True,   "Standing / breathing loop"),
    1:  ("running_right", 8,      10,   True,   "Active working (right-facing progress loop)"),
    2:  ("running_left",  8,      10,   True,   "Mirror of running-right (left-facing)"),
    3:  ("waving",        4,      8,    False,  "Greeting / notification"),
    4:  ("jumping",       5,      8,    False,  "Success / celebration"),
    5:  ("failed",        8,      6,    False,  "Error / failure reaction"),
    6:  ("waiting",       6,      6,    True,   "Waiting for input"),
    7:  ("running",       6,      10,   True,   "Active working (generic running loop)"),
    8:  ("review",        6,      6,    True,   "Review / inspection loop"),
}

# Flatten row index → (state_name, frames, fps, loop, description)
_row_by_index = {row: (name, frames, fps, loop, desc) for row, (name, frames, fps, loop, desc) in ANIMATION_ROWS.items()}

ANIMATION_BY_ROW: dict[int, dict] = {
    row: {"name": name, "row": row, "frames": frames, "fps": fps, "loop": loop, "desc": desc}
    for row, (name, frames, fps, loop, desc) in ANIMATION_ROWS.items()
}

# Reverse mapping: state name → animation config
ANIMATION_BY_STATE: dict[str, dict] = {
    name: {"name": name, "row": row, "frames": frames, "fps": fps, "loop": loop, "desc": desc}
    for row, (name, frames, fps, loop, desc) in ANIMATION_ROWS.items()
}

# State aliases (for flexible event input)
STATE_ALIASES: dict[str, str] = {
    "error": "failed",
    "thinking": "review",
    "planning": "review",
    "busy": "waiting",
    "offline": "idle",
    "pending": "waiting",
    "done": "review",
    "success": "review",
}

# ---------------------------------------------------------------------------
# Pet states (agent-level semantic states)
# ---------------------------------------------------------------------------
PET_STATES = frozenset({"idle", "running", "waiting", "failed", "review"})
PET_ACTIONS = frozenset({"update", "remove", "clear", "ack"})

# ---------------------------------------------------------------------------
# Codex pet.json model
# ---------------------------------------------------------------------------
@dataclass
class CodexPetManifest:
    """Mirrors the Codex pet.json format exactly."""
    id: str
    displayName: str
    description: str = ""
    spritesheetPath: str = "spritesheet.webp"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "displayName": self.displayName,
            "description": self.description,
            "spritesheetPath": self.spritesheetPath,
        }

    @classmethod
    def from_dict(cls, data: dict) -> CodexPetManifest:
        return cls(
            id=str(data.get("id", "")).strip(),
            displayName=str(data.get("displayName", "")).strip(),
            description=str(data.get("description", "")).strip(),
            spritesheetPath=str(data.get("spritesheetPath", "spritesheet.webp")).strip(),
        )


# ---------------------------------------------------------------------------
# Pet event model (what agents send to the bridge)
# ---------------------------------------------------------------------------
@dataclass
class PetEvent:
    """Normalised event from an agent to the pet bridge."""
    source_id: str
    label: str
    state: str
    message: str
    action: str = "update"
    ttl_ms: Optional[int] = None
    animation: Optional[str] = None
    direction: Optional[str] = None
    emotion: Optional[str] = None
    asset_id: Optional[str] = None
    notification_count: int = 0
    notification_kind: Optional[str] = None
    notification_label: Optional[str] = None
    updated_at: float = field(default_factory=time.time)


# ---------------------------------------------------------------------------
# Clean helpers (input sanitization — borrowed from taiei-hermes-pet)
# ---------------------------------------------------------------------------
def clean_text(value: Any, fallback: str, max_len: int) -> str:
    text = str(value or fallback).strip()
    return text[:max_len] if text else fallback


def clean_source_id(value: Any, *, fallback: str = "remote") -> str:
    raw = clean_text(value, fallback, 64)
    clean = "".join(
        ch if (ch.isascii() and ch.isalnum()) or ch in "._-" else "-" for ch in raw
    )
    return clean.strip("._-")[:64] or fallback


def clean_optional_token(value: Any, max_len: int = 32) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip().lower()
    if not raw:
        return None
    clean = "".join(
        ch if (ch.isascii() and ch.isalnum()) or ch in "._-" else "-" for ch in raw
    )
    clean = clean.strip("._-")[:max_len]
    return clean or None


def normalize_state(state: str) -> str:
    """Normalise raw input to the five Codex Pet semantic states."""
    s = str(state or "").strip().lower()
    s = STATE_ALIASES.get(s, s)
    if s in PET_STATES:
        return s
    return "idle"


# ---------------------------------------------------------------------------
# Event normalisation
# ---------------------------------------------------------------------------
def normalize_event(payload: dict[str, Any], *, require_protocol: bool = False) -> PetEvent:
    """Parse and validate a raw JSON event dict into a PetEvent."""
    protocol = payload.get("protocol")
    if require_protocol and protocol != PROTOCOL_VERSION:
        raise ValueError(f"protocol must be {PROTOCOL_VERSION}")
    if protocol is not None and protocol != PROTOCOL_VERSION:
        raise ValueError(f"protocol must be {PROTOCOL_VERSION}")

    action = clean_text(payload.get("action"), "update", 16).lower()
    if action not in PET_ACTIONS:
        raise ValueError(f"action must be one of {', '.join(sorted(PET_ACTIONS))}")

    raw_state = payload.get("state", "idle")
    state = normalize_state(raw_state)

    ttl_raw = payload.get("ttl_ms")
    ttl_ms: Optional[int]
    if ttl_raw is None:
        ttl_ms = None
    else:
        ttl_ms = max(1_000, min(int(ttl_raw), 600_000))

    source_id = clean_source_id(payload.get("source_id"))
    notification_kind = clean_optional_token(
        payload.get("notification_kind") or payload.get("notificationKind") or payload.get("badge_kind") or payload.get("badgeKind")
    )
    notification_count_val = payload.get("notification_count") or payload.get("notificationCount") or payload.get("badge_count") or payload.get("badgeCount")
    if notification_count_val is not None:
        try:
            notification_count = max(0, min(int(notification_count_val), 99))
        except (TypeError, ValueError):
            notification_count = 1 if notification_kind else 0
    else:
        notification_count = 1 if notification_kind else 0

    return PetEvent(
        source_id=source_id,
        label=clean_text(payload.get("label"), source_id, 64),
        state=state,
        message=clean_text(
            payload.get("message") or payload.get("event_type") or payload.get("text"),
            state,
            180,
        ),
        action=action,
        ttl_ms=ttl_ms,
        animation=clean_optional_token(payload.get("animation")),
        direction=clean_optional_token(payload.get("direction"), 16),
        emotion=clean_optional_token(payload.get("emotion"), 24),
        asset_id=clean_optional_token(
            payload.get("pet_asset_id") or payload.get("petAssetId")
            or payload.get("artwork_asset_id") or payload.get("artworkAssetId")
            or payload.get("asset_id") or payload.get("assetId"),
            96,
        ),
        notification_count=notification_count,
        notification_kind=notification_kind,
        notification_label=clean_optional_token(
            payload.get("notification_label") or payload.get("notificationLabel") or payload.get("badge_label") or payload.get("badgeLabel"),
            4,
        ),
    )


# ---------------------------------------------------------------------------
# Spritesheet helpers
# ---------------------------------------------------------------------------
def cell_bounds(row: int, col: int) -> tuple[int, int, int, int]:
    """Return (x, y, w, h) pixel bounds for a given cell in the atlas."""
    return (
        col * CODEX_CELL_WIDTH,
        row * CODEX_CELL_HEIGHT,
        CODEX_CELL_WIDTH,
        CODEX_CELL_HEIGHT,
    )


def background_position(row: int, col: int) -> str:
    """Return CSS background-position value for a given cell."""
    return f"-{col * CODEX_CELL_WIDTH}px -{row * CODEX_CELL_HEIGHT}px"


def state_to_row(state: str) -> int:
    """Map a state name to its spritesheet row index."""
    s = normalize_state(state)
    anim = ANIMATION_BY_STATE.get(s)
    return anim["row"] if anim else 0
