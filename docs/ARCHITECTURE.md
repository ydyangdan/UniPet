# UniPet Architecture

## Goal

UniPet is a desktop status surface for coding agents. It stays outside agent cores, listens only on localhost, and keeps the state model compatible with Codex Pet.

## Runtime Components

```text
overlay/cli.js
  - global `unipet` command
  - starts/stops Electron
  - sends events to the local bridge

overlay/main.js
  - Electron main process
  - transparent always-on-top window
  - HTTP bridge on 127.0.0.1:8768
  - WebSocket bridge on 127.0.0.1:8769
  - runtime metadata in ~/.unipet/runtime/pet_runtime.json
  - render scale and window sizing

overlay/core.js
  - `unipet.v1` protocol
  - event normalization
  - Codex state aliases
  - TTL cleanup
  - active pet priority

overlay/renderer.js
  - Codex spritesheet animation
  - scaled atlas rendering
  - bubble text
  - hover/click jumping
  - drag-to-position

connectors/hermes/plugins/unipet
  - Hermes lifecycle hooks
  - best-effort local HTTP event emission
  - optional auto-start of UniPet

connectors/hermes/skills/unipet/SKILL.md
  - manual Hermes calling convention
  - fallback contract for CLI-driven status updates
```

## State Model

UniPet uses the Codex Pet state set:

```text
idle
running
waiting
failed
review
```

Aliases such as `thinking`, `planning`, `success`, and `error` are accepted by the protocol layer and normalized into the five states.

## Event Flow

Automatic Hermes path:

```text
Hermes lifecycle hook
        |
        v
connectors/hermes/plugins/unipet
        |
        | POST http://127.0.0.1:8768/api/pet/events
        v
overlay/main.js bridge
```

Manual or script path:

```text
unipet emit running "Hermes is working" --source hermes --label Hermes
        |
        v
overlay/cli.js
        |
        | POST http://127.0.0.1:8768/api/pet/events
        v
overlay/main.js bridge
```

Electron main process:

```text
1. validates and normalizes the event
2. stores it by source_id
3. computes active state by priority and recency
4. broadcasts a WebSocket state_update
5. forwards updates to the renderer through preload IPC
```

Renderer:

```text
1. receives the active state
2. selects the spritesheet row
3. scales a 192 x 208 atlas cell to the configured display size
4. updates CSS background-position
5. shows animation and bubble text
```

## Render Sizing

The bundled spritesheet uses 192 x 208 cells. UniPet treats this as a high-resolution atlas and renders at scale `0.5` by default, producing a 96 x 104 desktop pet.

The optional environment variable `UNIPET_RENDER_SCALE` can tune this for testing. Values are clamped between `0.35` and `1`.

## Design Notes

- Local-first: bind to `127.0.0.1`.
- Low configuration: `unipet emit` and the Hermes plugin can auto-start the runtime when possible.
- Minimal runtime stack: Node.js, Electron, and `ws`.
- Zero-intrusion Hermes integration: install plugin/skill under Hermes home, do not edit Hermes core.
- Replaceable shell: the HTTP event contract is stable enough for a future lighter UI shell.
