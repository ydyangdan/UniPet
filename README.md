# UniPet

UniPet is a universal desktop pet for AI coding agents. The current runtime is Node.js + Electron, with a small localhost event protocol that lets Hermes and other tools drive the pet without modifying agent core code.

## Current Status

- Windows-first MVP is usable.
- Runtime stack is Node.js + Electron only.
- Hermes integration is zero-intrusion: a Hermes plugin emits lifecycle events, and a Hermes skill remains available as a manual fallback contract.
- The UI uses Codex Pet semantic states and a Codex-compatible spritesheet.
- Pets can be listed, switched, removed, and installed from the Codex Pets market.
- The default render scale is 0.5, so a 192 x 208 atlas cell appears as a 96 x 104 desktop pet, matching the smaller Codex Pet feel.

## Requirements

- Node.js 18+
- npm
- Hermes Agent is optional, only needed for automatic Hermes lifecycle integration.

UniPet itself does not require Python. The Hermes plugin is a tiny Python file because Hermes loads plugins in its own Python environment; it uses only Python standard library modules.

## Quick Start

Windows PowerShell (from the project root):

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Unix / WSL (from the project root):

```bash
./install.sh
```

Manual runtime install:

```powershell
cd overlay
npm install
npm link
unipet start
```

Send a test event:

```powershell
unipet emit running "Hermes is working" --source hermes --label Hermes --ttl-ms 120000
unipet emit review "Ready for review" --source hermes --label Hermes --ttl-ms 300000
```

Inspect or stop:

```powershell
unipet status
unipet doctor
unipet clear
unipet stop
```

Browse and install pets:

```powershell
unipet market list
unipet market search cat
unipet market info anby
unipet market install anby --use
```

Manage local pets:

```powershell
unipet pet list
unipet pet current
unipet pet use pounce
unipet pet remove anby
```

## Hermes Integration

The top-level installer calls the Hermes installer automatically unless `-NoHermesSkill` (Windows) or `--no-hermes-skill` (Unix) is used:

```powershell
# Runtime only, no Hermes plugin
.\install.ps1 -NoHermesSkill
```

```bash
# Runtime only, no Hermes plugin
./install.sh --no-hermes-skill
```

Standalone Hermes install:

```powershell
.\connectors\hermes\install.ps1
```

or:

```bash
./connectors/hermes/install.sh
```

The installer copies:

```text
$HERMES_HOME/plugins/unipet
$HERMES_HOME/skills/unipet
```

When the `hermes` command is available, it also runs:

```powershell
hermes plugins enable unipet
```

Start a new Hermes session after enabling the plugin. Hooks are loaded per session.

## Architecture

```text
Hermes plugin / OpenClaw plugin / CLI / local script
        |
        | HTTP POST /api/pet/events or unipet emit ...
        v
overlay/main.js
  - Electron desktop window
  - HTTP bridge on 127.0.0.1:8768
  - WebSocket bridge on 127.0.0.1:8769
  - runtime file in ~/.unipet/runtime/pet_runtime.json
  - current pet config in ~/.unipet/config.json
  - installed pets in ~/.unipet/pets
        |
        v
overlay/renderer.js
  - Codex-compatible spritesheet animation
  - bubble text
  - hover/click jumping
  - drag support
```

## Project Layout

```text
UniPet/
|-- overlay/                         Node/Electron runtime
|   |-- main.js                      Electron app + local bridge
|   |-- core.js                      protocol normalization + state store
|   |-- cli.js                       global unipet command
|   |-- market.js                    Codex Pets market client
|   |-- pets.js                      local pet library
|   |-- renderer.js                  spritesheet animation renderer
|   |-- tests/                       Node test suite
|   `-- assets/default/              default Codex pet asset
|-- connectors/hermes/               Hermes zero-intrusion integration
|   |-- plugins/unipet/              Hermes lifecycle plugin
|   |-- skills/unipet/SKILL.md       Hermes manual skill contract
|   `-- install.ps1 / install.sh     Hermes installer
|-- docs/                            design and usage notes
|-- install.ps1                      Windows one-time setup
`-- install.sh                       Unix/WSL one-time setup
```

## Event Model

UniPet uses the same five semantic states as Codex Pet:

```text
idle
running
waiting
failed
review
```

Aliases such as `thinking`, `planning`, `success`, and `error` are normalized into those states by `overlay/core.js`.

## Local API

```text
GET  http://127.0.0.1:8768/health
GET  http://127.0.0.1:8768/api/pet/view
POST http://127.0.0.1:8768/api/pet/events
POST http://127.0.0.1:8768/api/pet/use
WS   ws://127.0.0.1:8769/ws
```

## Docs
- [Architecture](docs/ARCHITECTURE.md)
- [Hermes Skill Contract](docs/HERMES_SKILL_CONTRACT.md)
