# UniPet

UniPet is a local-first desktop pet for AI coding agents. The current stack is Node.js + Electron, with a small localhost protocol that Hermes can call without modifying Hermes core.

## What It Does

- Shows a transparent always-on-top desktop pet.
- Uses Codex Pet semantic states: `idle`, `running`, `waiting`, `failed`, `review`.
- Accepts local HTTP events and broadcasts state through WebSocket.
- Provides a global `unipet` CLI for Hermes skills, scripts, and manual testing.
- Keeps the runtime local: `127.0.0.1:8768` for HTTP and `127.0.0.1:8769` for WebSocket.

## Quick Start

Windows PowerShell:

```powershell
cd D:\codex_info\UniPet
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Manual install:

```powershell
cd D:\codex_info\UniPet\overlay
npm install
npm link
unipet launch
```

Send a test event:

```powershell
unipet emit running "Hermes is working" --source hermes --label Hermes --ttl-ms 120000
unipet emit review "Ready for review" --source hermes --label Hermes --ttl-ms 300000
```

Check or stop:

```powershell
unipet status
unipet doctor
unipet stop
```

## Architecture

```text
Hermes skill / CLI / local script
        |
        | unipet emit ... or HTTP POST /api/pet/events
        v
overlay/cli.js
        |
        v
overlay/main.js
  - Electron desktop window
  - HTTP bridge on 127.0.0.1:8768
  - WebSocket bridge on 127.0.0.1:8769
  - runtime file in ~/.unipet/runtime/pet_runtime.json
        |
        v
overlay/renderer.js
  - Codex-compatible spritesheet animation
  - speech bubble
  - drag support
```

## Project Layout

```text
UniPet/
├── overlay/                         Node/Electron runtime
│   ├── main.js                      Electron app + local bridge
│   ├── core.js                      protocol normalization + state store
│   ├── cli.js                       global unipet command
│   ├── renderer.js                  spritesheet animation renderer
│   ├── tests/                       Node test suite
│   └── assets/default/              default Codex pet asset
├── connectors/hermes/               Hermes zero-intrusion integration
│   ├── skills/unipet/SKILL.md       Hermes skill contract
│   └── install.ps1 / install.sh     skill installer
├── docs/                            design and usage notes
├── install.ps1                      Windows one-time setup
├── install.sh                       Unix/WSL one-time setup
└── QUICKSTART.md                    practical runbook
```

## Runtime Dependencies

- Node.js 18+
- npm
- Electron and `ws`, installed by `npm install` inside `overlay/`

Python is not part of the current runtime.

## Docs

- [Quickstart](QUICKSTART.md)
- [Usage](docs/USAGE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Hermes Skill Contract](docs/HERMES_SKILL_CONTRACT.md)
