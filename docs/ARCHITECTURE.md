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

overlay/core.js
  - `unipet.v1` protocol
  - event normalization
  - Codex state aliases
  - TTL cleanup
  - active pet priority

overlay/renderer.js
  - Codex spritesheet animation
  - bubble text
  - drag-to-position

connectors/hermes/skills/unipet/SKILL.md
  - Hermes calling convention
  - zero-intrusion integration
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

```text
Hermes calls:
  unipet emit running "Hermes is working" --source hermes --label Hermes

CLI behavior:
  1. ensure the runtime is alive
  2. auto-launch UniPet if needed
  3. POST a `unipet.v1` event to /api/pet/events

Electron main process:
  1. validates and normalizes the event
  2. stores it by source_id
  3. computes active state by priority and recency
  4. broadcasts a WebSocket state_update

Renderer:
  1. receives the update through preload IPC
  2. selects the spritesheet row
  3. shows animation and bubble text
```

## Design Notes

- Local-first: bind to `127.0.0.1`.
- Low configuration: `unipet emit` auto-launches the runtime when possible.
- Minimal runtime stack: Node.js, Electron, and `ws`.
- Replaceable shell: the HTTP event contract is stable enough for a future lighter UI shell.
