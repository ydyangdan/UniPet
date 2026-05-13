# Render Architecture

UniPet renders Codex-compatible spritesheets directly in Electron.

## Asset Format

The default pet uses a Codex-style atlas:

```text
overlay/assets/default/
|-- spritesheet.webp
`-- pet.json
```

The renderer assumes 192 x 208 source cells and maps semantic states to known sprite rows.

## Display Scale

The source atlas is treated as a high-resolution asset. The default `UNIPET_RENDER_SCALE` is `0.5`, so each 192 x 208 source cell is displayed as 96 x 104 CSS pixels.

This keeps the pet close to the Codex desktop pet size and avoids the oversized look from rendering the source cell at full size.

The main process uses the same scale to size the transparent Electron window, and the renderer uses it to calculate:

```text
display width
display height
background-size
background-position
```

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

No frame extraction is needed. The browser moves the background position across the scaled atlas.

## Current State Rows

```text
idle     -> row 0
running  -> row 7
waiting  -> row 6
failed   -> row 5
review   -> row 8
```

Additional motion rows such as left/right running, waving, and jumping remain renderer-only animations. The `jumping` row plays on hover and click without changing the bridge state.
