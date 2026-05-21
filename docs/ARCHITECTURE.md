# UniPet Architecture

UniPet is a local desktop status surface for AI coding agents. It stays outside
agent cores, listens on localhost, and renders a Codex Pet-compatible companion
from a small shared state protocol.

## Layers

```text
Agent hook/plugin/script
        |
        v
Bridge protocol
        |
        v
State store
        |
        v
Life engine
        |
        v
Renderer
```

## Runtime

| Module | Responsibility |
| --- | --- |
| `overlay/cli.js` | `unipet` command: runtime control, agent management, pet management, manual state events |
| `overlay/main.js` | Electron main process, transparent window, local HTTP/WebSocket bridge |
| `overlay/protocol.js` | protocol version, event validation, state aliases, `ttl` normalization |
| `overlay/core.js` | per-source state store, expiry cleanup, active-state selection |
| `overlay/life/*` | local personality layer derived from state and message |
| `overlay/renderer.js` | sprite rendering, bubbles, drag/click behavior, pet hot reload |
| `overlay/pets.js` | local pet library under `~/.unipet` |
| `overlay/market.js` | Codex-compatible pet market client |

## Connectors

| Connector | Method | Source id |
| --- | --- | --- |
| Codex | managed hooks | `codex` |
| Claude Code | managed hooks | `claude-code` |
| Hermes | plugin | `hermes` |
| OpenClaw | native plugin | `openclaw` |
| DeepSeek-TUI | managed hooks block | `deepseek-tui` |
| Custom agent | HTTP or `unipet state` | caller-defined |

Connector details live in [`CONNECTORS.md`](CONNECTORS.md).

## State Model

UniPet uses five canonical states:

```text
idle
running
waiting
failed
review
```

The bridge accepts common aliases such as `thinking`, `planning`, `pending`,
`success`, `done`, and `error`, then normalizes them before storing or
broadcasting state.

## Protocol Boundary

Connectors send only:

```json
{
  "source": "codex",
  "state": "running",
  "message": "Running tests",
  "action": "update",
  "ttl": "2m"
}
```

They do not send animation names, emotions, directions, or renderer hints. The
renderer owns presentation. This keeps agent integrations stable while allowing
the pet behavior to evolve.

The protocol is documented in [`PROTOCOL.md`](PROTOCOL.md).

## Pet Behavior

The life engine is local and short-lived. It reads `state + message` and derives
presentation intent:

```text
running + shell/test message   -> focused work motion
running + read/search message  -> scan motion
waiting                        -> patient idle motion
failed                         -> alert motion
review                         -> completion motion
idle                           -> calm idle with rare small moments
```

UniPet does not store memory, make decisions, or replace the agent. The agent
does the work; UniPet visualizes what is happening.

## Pet Assets

Pet assets are Codex-compatible:

```text
pet.json
spritesheet.webp
```

Installed pets live under `~/.unipet/pets`. The selected pet is stored in
`~/.unipet/config.json`. `unipet pet install <id> --use` can hot-reload the
running overlay.

The default renderer treats the 192 x 208 atlas cells as high-resolution assets
and renders them at a smaller desktop scale by default.

## Design Principles

- Local-first: default bind address is `127.0.0.1`.
- Zero-intrusion: use hooks, plugins, or managed config blocks.
- Small protocol: source, state, message, action, ttl.
- Thin connectors: no renderer or animation knowledge.
- Replaceable shell: the bridge protocol can support a future lighter UI.
- Minimal runtime stack: Node.js, Electron, and `ws`.
