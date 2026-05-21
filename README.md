# UniPet

[中文文档](README_zh.md)

UniPet is a Universal Desktop Pet for AI coding agents.

Think Codex Pet, but for every coding agent. UniPet gives Codex, Claude Code,
Hermes, OpenClaw, DeepSeek-TUI, shell scripts, and your own agents a small
animated desktop companion that reacts to their real-time state. It runs locally
as a lightweight Node.js + Electron overlay, connects through zero-intrusion
hooks on localhost, and keeps your agent setup clean.

![UniPet demo](docs/assets/unipet-hermes-demo.png)

```bash
npm install -g uni-pet
unipet start
unipet agent add codex
```

## Why UniPet

- Codex Pet-style desktop companion, but not limited to Codex.
- Works with Codex, Claude Code, Hermes, OpenClaw, DeepSeek-TUI, and custom agents.
- Local-first: listens on localhost and keeps events on your machine.
- Zero-intrusion: uses hooks, plugins, or config blocks instead of patching agent source code.
- Lightweight: Node.js + Electron; UniPet itself does not require Python.
- Codex-compatible pet market support: install, switch, and remove pets from the CLI.

The Hermes connector contains a tiny Python plugin only because Hermes loads
plugins in its own Python environment. That plugin uses only Python standard
library modules.

## Quick Start

For most users:

```bash
npm install -g uni-pet
unipet start
```

Connect only the agents you use:

```bash
unipet agent add codex
unipet agent add claude-code
unipet agent add hermes
unipet agent add openclaw
unipet agent add deepseek-tui
```

Update later with:

```bash
npm update -g uni-pet
```

## Supported Agents

| Agent | Setup | Integration |
| --- | --- | --- |
| Codex | `unipet agent add codex` | Codex hooks |
| Claude Code | `unipet agent add claude-code` | Claude Code hooks |
| Hermes | `unipet agent add hermes` | Hermes plugin |
| OpenClaw | `unipet agent add openclaw` | OpenClaw plugin |
| DeepSeek-TUI | `unipet agent add deepseek-tui` | lifecycle hooks |
| Custom agents | `unipet state ...` or HTTP | localhost bridge |

## Daily Use

Start, inspect, and stop UniPet:

```bash
unipet start
unipet status
unipet doctor
unipet stop
```

Send a manual test event:

```bash
unipet state running "Running tests"
unipet state review "Ready for review"
unipet clear
```

The local bridge listens on:

```text
HTTP  http://127.0.0.1:8768
WS    ws://127.0.0.1:8769/ws
```

## Pets

Browse and install online pets:

```bash
unipet pet search
unipet pet search cat
unipet pet info anby
unipet pet install anby --use
```

Manage local pets:

```bash
unipet pet list
unipet pet current
unipet pet use anby
unipet pet remove anby
```

Installed pets and user config live under `~/.unipet`.

## Agent Management

Use `agent` to add, inspect, disable, or remove UniPet integrations:

```bash
unipet agent list
unipet agent status
unipet agent add codex
unipet agent disable codex
unipet agent remove codex
```

You can replace `codex` with `claude-code`, `hermes`, `openclaw`,
`deepseek-tui`, or `all`.

## How It Works

```text
Agent hook/plugin
      -> UniPet localhost bridge
      -> state/event engine
      -> desktop pet renderer
```

Connectors translate agent lifecycle events into a small local event payload:
`source`, `state`, `message`, `action`, and `ttl`. The renderer then maps
those events into Codex Pet-style states, bubbles, and small companion motions.

## Requirements

- Node.js 18+
- npm
- A desktop session that can run Electron

Windows is the primary tested platform. macOS and Linux use the same Node.js +
Electron runtime. WSL requires WSLg or another working Linux GUI display.

Hermes, OpenClaw, DeepSeek-TUI, Codex, and Claude Code are optional. Install or
connect only the agents you actually use.

## Install From Source

GitHub source installs are mainly for development or trying unreleased changes.

Windows PowerShell:

```powershell
git clone https://github.com/ydyangdan/UniPet.git
cd UniPet
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOS, Linux, Unix, or WSL:

```bash
git clone https://github.com/ydyangdan/UniPet.git
cd UniPet
./install.sh
```

The source installer runs `npm install`, links the global `unipet` command,
starts UniPet, and prints `unipet doctor` output. It does not change any agent
configuration. Add only the connectors you need with `unipet agent add ...`.

If a Unix checkout loses executable bits, run:

```bash
chmod +x ./install.sh ./connectors/*/install.sh
```

## Project Layout

```text
UniPet/
|-- overlay/                         Node.js/Electron desktop runtime
|   |-- main.js                      Electron app + local HTTP/WS bridge
|   |-- core.js                      event normalization + state store
|   |-- cli.js                       global unipet command
|   |-- market.js                    Codex pet market client
|   |-- pets.js                      local pet library
|   |-- renderer.js                  spritesheet animation renderer
|   |-- life/                        companion behavior layer
|   |-- renderers/                   renderer adapters
|   |-- tests/                       Node test suite
|   `-- assets/default/              bundled default pet
|-- connectors/codex/                Codex hook connector
|-- connectors/claude-code/          Claude Code hook connector
|-- connectors/hermes/               Hermes plugin connector
|-- connectors/openclaw/             OpenClaw hook plugin
|-- connectors/deepseek-tui/         DeepSeek-TUI hook connector
|-- docs/                            design notes
|-- install.ps1                      Windows installer
`-- install.sh                       Unix installer
```

## Development

```bash
npm install
npm run check
npm start
```

`npm run check` runs the overlay tests and connector tests for OpenClaw,
DeepSeek-TUI, Codex, and Claude Code.

## Troubleshooting

- Run `unipet doctor` first. It checks the local bridge, runtime file, current
  pet, and command setup.
- If `127.0.0.1:8768` is already in use, run `unipet stop`, then `unipet start`.
- After installing a connector, restart the related agent session, gateway, or TUI.
- If the pet does not appear on Linux or WSL, make sure Electron can open a GUI
  window in your desktop session.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Protocol](docs/PROTOCOL.md)
- [Connectors](docs/CONNECTORS.md)

## License

MIT
