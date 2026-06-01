# UniPet Vision and Upgrade Plan

This document records the product direction discussed on 2026-06-01. The
short-term product remains a usable universal desktop pet for AI coding agents.
The long-term goal is broader: UniPet should become a lightweight visual life
form for AI agents, not just a floating animated skin.

## Product Positioning

UniPet is the visual status layer between AI agents and people.

It should stay local-first, agent-agnostic, and small enough to run all day. The
agent does the reasoning and coding work. UniPet turns that hidden agent
activity into visible presence: thinking, working, waiting, failing, recovering,
and completing.

The closest reference is Codex Pet, but UniPet should be universal:

- Codex Pet-compatible assets and animation semantics.
- A stable local protocol for any agent.
- Thin, zero-intrusion connectors.
- A desktop companion that can grow into a virtual agent life form.

## Design Principles

- Local-first: bind to localhost by default and keep state on the user's machine.
- Zero-intrusion: integrate through hooks, plugins, scripts, or managed config.
- Stable protocol: connectors send only `source`, `state`, `message`, `action`,
  and `ttl`.
- Thin connectors: no connector should know animation rows, emotions, or renderer
  details.
- Replaceable runtime: the bridge and life engine must not depend on Electron.
- Lightweight by default: avoid unnecessary background work, dependencies, and
  memory pressure.
- Developer-friendly: keep CLI, docs, examples, and pet formats easy to modify.
- Playful but useful: the pet should be delightful because it explains what the
  agent is doing, not because it distracts from work.

## Virtual Life Model

The life model is the core product concept. It should be independent from the UI
runtime so it can drive Electron today and a lighter renderer later.

```text
Agent event
    |
    v
Perception layer
    |
    v
Emotion layer
    |
    v
Behavior layer
    |
    v
Expression layer
    |
    v
Desktop companion
```

### Perception Layer

The perception layer reads canonical agent state and short messages:

- `idle`: nothing active, calm presence.
- `running`: the agent is thinking, planning, using tools, testing, or editing.
- `waiting`: the agent needs user input, approval, or external action.
- `failed`: a tool, task, or agent turn failed.
- `review`: the agent has produced something ready to read.

It can also classify message intent locally, for example shell work, file
reading, editing, search, delegation, tests, or final answer.

### Emotion Layer

The emotion layer derives a small, local emotional tone:

- calm
- focused
- curious
- patient
- happy
- worried
- blocked
- recovering

These are presentation states, not model decisions. They should be deterministic
and explainable from recent local events.

### Behavior Layer

The behavior layer chooses what the companion should do:

- breathe, blink, and look around while idle.
- focus while the agent is running.
- wait patiently when the agent needs input.
- celebrate briefly when work is ready.
- show concern when blocked or failed.
- settle back to idle after short active motions.

Behavior should be subtle. The default should feel alive, not noisy.

### Expression Layer

The expression layer maps behavior to the active renderer:

- spritesheet animation
- bubble text
- drag and hover response
- small CSS or native effects
- future sound, wake word, or voice feedback

The expression layer may differ by runtime, but it must consume the same life
intent model.

## Codex Client Reference

The official `openai/codex` client is mostly Rust. The pet implementation lives
under `codex-rs/tui/src/pets/`.

Important references from the current upstream snapshot:

- `catalog.rs`: built-in pet catalog and atlas geometry.
- `model.rs`: pet manifest parsing and default animation model.
- `frames.rs`: splits the spritesheet into cached PNG frames.
- `ambient.rs`: chooses the current animation frame and placement.
- `image_protocol.rs`: emits Kitty graphics or Sixel terminal image commands.

What UniPet should learn from Codex:

- The pet atlas is `1536 x 1872`, with `192 x 208` cells in an `8 x 9` grid.
- Custom pets live under `$CODEX_HOME/pets/<id>/pet.json`.
- Codex also supports legacy avatar manifests under `$CODEX_HOME/avatars/<id>`.
- `pet.json` can include:

```json
{
  "id": "chefito",
  "displayName": "Chefito",
  "description": "A tiny recipe-loving chef",
  "spritesheetPath": "spritesheet.webp",
  "frame": {
    "width": 192,
    "height": 208,
    "columns": 8,
    "rows": 9
  },
  "animations": {
    "wave": {
      "frames": [24, 25, 26, 27],
      "fps": 8,
      "loop": false,
      "fallback": "idle"
    }
  }
}
```

- Codex default idle uses uneven frame durations, not a fixed FPS loop.
- Codex action animations play a short primary sequence, repeat it a few times,
  then settle into idle.
- Terminal Codex renders through terminal image protocols, not a desktop
  transparent window.

This means UniPet's current "Codex-compatible" support is a good MVP, but not a
complete implementation yet. UniPet should align the manifest and animation
semantics more closely while keeping the desktop overlay product shape.

## Target Architecture

UniPet should evolve toward this shape:

```text
connectors/
    Agent-specific hook/plugin/script adapters

protocol/
    Stable event schema and validation

bridge/
    Local HTTP/WebSocket state service

life/
    Perception, emotion, behavior, bubble policy, timing

renderers/
    Runtime-specific expression adapters

runtime-electron/
    Current desktop overlay runtime

runtime-light/
    Future Rust/Tauri or native lightweight runtime
```

The current repository can keep its existing structure while moving in this
direction gradually. The important boundary is:

```text
connector event -> protocol event -> life intent -> renderer command
```

Connectors should stop at protocol events. Renderers should start from life
intent. The life layer is the product brain for presence and expression.

## Runtime Strategy

### Current Runtime

Keep Node.js + Electron for the current stable product:

- fastest iteration
- easiest npm distribution
- simple transparent desktop window
- easy HTML/CSS spritesheet rendering
- developer-friendly debugging

### Future Lightweight Runtime

Plan a lighter renderer without breaking users:

- keep `uni-pet` npm CLI for installation, connector management, market, and
  developer commands.
- add a Rust runtime for bridge, state, life engine, and transparent overlay.
- evaluate Tauri/Wry first because it keeps web-style rendering while reducing
  Electron overhead.
- consider `winit + softbuffer/wgpu` later for a more native renderer if the
  product needs lower memory, richer effects, or a non-WebView animation engine.

Recommended path:

```text
MVP and product polish       Node.js + Electron
Lightweight v1               Node CLI + Rust/Tauri runtime
Advanced life-form runtime   Rust native window + custom renderer
```

## Upgrade Plan

### Phase 1: Codex Pet Compatibility

Goal: make UniPet truly compatible with Codex custom pets.

- Support Codex `frame` manifest shape.
- Support Codex `animations` manifest shape.
- Preserve original pet manifests on local import and market install.
- Keep old UniPet manifest fields as derived compatibility metadata.
- Align default animation timing with Codex:
  - slow uneven idle frames
  - short action sequences
  - automatic settle back to idle
- Add tests for default idle, running, waiting, failed, and review animation
  timing.

### Phase 2: Life Engine Boundary

Goal: make the virtual life model explicit in code.

- Split perception, emotion, behavior, and bubble policy into separate modules.
- Define a small `LifeIntent` object consumed by renderers.
- Keep renderer-specific details out of `core.js` and connectors.
- Add tests for message classification and state transitions.

### Phase 3: User Experience Polish

Goal: make the pet useful and pleasant during real work.

- Tune idle behavior so it feels calm and alive.
- Tune bubble text length, timing, and style.
- Make waiting/review/failure states visibly different but not distracting.
- Add better first-run guidance through `unipet doctor` and `unipet agent status`.
- Keep desktop interactions simple: drag, click, hover, hide/show.

### Phase 4: Connector Maturity

Goal: make UniPet feel like a standard status layer for agent tools.

- Keep connector install/remove lifecycle complete.
- Add examples for shell scripts and custom agents.
- Document the stable protocol as the preferred integration path.
- Keep agent-specific connectors thin and independently testable.

### Phase 5: Lightweight Runtime Prototype

Goal: reduce memory and package size without breaking the current product.

- Extract shared life and protocol logic behind runtime-neutral APIs.
- Prototype a Rust/Tauri runtime that reads the same protocol events.
- Measure memory, startup time, drag behavior, transparent window behavior, and
  packaging size.
- Keep Electron as the stable runtime until the lightweight runtime is clearly
  better for users.

### Phase 6: Virtual Life Features

Goal: grow toward an agent life-form interface without becoming an agent itself.

- Voice wake hooks as optional modules.
- LLM reply preview bubbles with safe truncation.
- More expressive reaction rules from recent local events.
- Optional sound and notification policies.
- Multi-agent presence, with clear source identity and low visual noise.

Memory, personality, and autonomous decision-making should stay out of scope
until the local status layer is mature.

## Near-Term Priorities

The next practical work should happen in this order:

1. Align pet manifest parsing and animation timing with Codex.
2. Make the life engine boundary clearer in code.
3. Improve bubble and idle behavior based on real use.
4. Strengthen docs around protocol and custom agents.
5. Prototype a lightweight runtime only after the current product feels stable.

This keeps UniPet useful today while moving it toward the larger vision: a
universal, local, delightful visual life form for AI agents.
