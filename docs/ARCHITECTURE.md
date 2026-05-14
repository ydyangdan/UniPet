# UniPet Architecture

## Goal

UniPet is a desktop status surface for coding agents. It stays outside agent cores, listens only on localhost, and keeps the state model compatible with Codex Pet.

## Runtime Components

```text
overlay/cli.js
  - global `unipet` command
  - starts/stops Electron
  - sends events to the local bridge
  - exposes `market` and `pet` grouped subcommands

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
  - runtime spritesheet switching
  - bubble text
  - hover/click jumping
  - drag-to-position

overlay/pets.js
  - local pet library under ~/.unipet/pets
  - current selection in ~/.unipet/config.json
  - built-in pounce fallback

overlay/market.js
  - Codex Pets market client
  - list/search/info/install
  - downloads spritesheet.webp without extra dependencies

connectors/hermes/plugins/unipet
  - Hermes lifecycle hooks
  - best-effort local HTTP event emission
  - optional auto-start of UniPet

connectors/hermes/skills/unipet/SKILL.md
  - manual Hermes calling convention
  - fallback contract for CLI-driven status updates

connectors/openclaw/plugin
  - OpenClaw native hook plugin
  - message and agent lifecycle mapping
  - best-effort local HTTP event emission
  - no OpenClaw source changes

connectors/deepseek-tui
  - DeepSeek-TUI lifecycle hook commands
  - user config marker block under ~/.deepseek/config.toml
  - best-effort local HTTP event emission
  - no DeepSeek-TUI source changes
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

Automatic OpenClaw path:

```text
OpenClaw native hook
        |
        v
connectors/openclaw/plugin
        |
        | POST http://127.0.0.1:8768/api/pet/events
        v
overlay/main.js bridge
```

Automatic DeepSeek-TUI path:

```text
DeepSeek-TUI lifecycle hook
        |
        v
unipet hook deepseek-tui <event>
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

## Pet Asset Flow

```text
unipet market install anby --use
        |
        v
overlay/market.js
  - GET https://codex-pets.net/api/pets/anby
  - download spritesheet.webp
        |
        v
overlay/pets.js
  - write ~/.unipet/pets/anby/pet.json
  - write ~/.unipet/pets/anby/spritesheet.webp
  - update ~/.unipet/config.json when --use is set
        |
        v
overlay/main.js
  - POST /api/pet/use hot-reloads the running overlay
        |
        v
overlay/renderer.js
  - swaps background-image to the selected spritesheet
```

## Render Sizing

The bundled spritesheet uses 192 x 208 cells. UniPet treats this as a high-resolution atlas and renders at scale `0.5` by default, producing a 96 x 104 desktop pet.

The optional environment variable `UNIPET_RENDER_SCALE` can tune this for testing. Values are clamped between `0.35` and `1`.

## Design Notes

- Local-first: bind to `127.0.0.1`.
- Low configuration: `unipet emit` and the Hermes plugin can auto-start the runtime when possible.
- Minimal runtime stack: Node.js, Electron, and `ws`.
- Market import uses Node built-ins only; no zip extraction or image conversion is needed for the first version.
- Zero-intrusion Hermes integration: install plugin/skill under Hermes home, do not edit Hermes core.
- Zero-intrusion OpenClaw integration: install a native plugin through OpenClaw's plugin CLI, do not edit OpenClaw source.
- Zero-intrusion DeepSeek-TUI integration: install lifecycle hook commands in the user config, do not edit DeepSeek-TUI source.
- Replaceable shell: the HTTP event contract is stable enough for a future lighter UI shell.
