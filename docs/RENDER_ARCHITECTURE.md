# Render Architecture

UniPet renders Codex-compatible spritesheets directly in Electron.

## Asset Format

The default pet uses a Codex-style atlas:

```text
overlay/assets/default/
├── spritesheet.webp
└── pet.json
```

The renderer currently assumes 192 x 208 cells and maps semantic states to known sprite rows.

## Rendering Path

```text
WebSocket state_update
        |
        v
Electron main -> preload IPC
        |
        v
renderer.js
        |
        v
CSS background-position
```

No frame extraction is needed. The browser moves the background position across the original atlas.

## Current State Rows

```text
idle     -> row 0
running  -> row 7
waiting  -> row 6
failed   -> row 5
review   -> row 8
```

Additional motion rows such as left/right running, waving, and jumping remain renderer-only animations.
