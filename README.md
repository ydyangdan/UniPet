# UniPet

[中文文档](README_zh.md)

[![npm](https://img.shields.io/npm/v/uni-pet?color=0ea5e9)](https://www.npmjs.com/package/uni-pet)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

UniPet is a Universal Desktop Pet for AI coding agents.

Think Codex Pet, but for every agent. UniPet is a local visual status layer that
turns invisible agent work into a small animated desktop companion, so you can
see when your agent is thinking, running tools, waiting for input, failing, or
ready for review. It runs through a lightweight localhost protocol, so agents,
hooks, scripts, and plugins can drive the pet without patching their core code.

![UniPet demo](https://raw.githubusercontent.com/ydyangdan/UniPet/main/docs/assets/unipet-promo.gif)

```bash
npm install -g uni-pet
unipet start
unipet demo
unipet agent add codex
```

## Why UniPet

- Universal agent status layer for Codex, Claude Code, Hermes, OpenClaw, DeepSeek-TUI, and custom agents.
- Visual feedback for real work: idle, running, waiting, failed, and review states.
- Simple local protocol: drive UniPet from hooks, plugins, config blocks, CLI, HTTP, or WebSocket.
- Zero-intrusion: integrate with agents without modifying their source code.
- Local-first: listens on localhost and keeps events on your machine.
- Lightweight: Node.js + Electron; UniPet itself does not require Python.
- Codex-compatible pets: install, switch, and remove skins from the CLI.
- Built for standards: connectors send facts, while UniPet owns behavior, bubbles, and rendering.

## What UniPet Focuses On

- One stable event protocol for many agents instead of one-off integrations.
- A visible desktop companion for real coding-agent work, not a heavy virtual pet game.
- Developer-friendly extension points: hooks, plugins, CLI, HTTP, WebSocket, and local pet skins.
- Small local runtime that is easy to inspect, modify, and remove.

## Quick Start

For most users:

```bash
npm install -g uni-pet
unipet start
unipet demo
```

Connect only the agents you use:

```bash
unipet agent add codex
unipet agent add claude-code
unipet agent add hermes
unipet agent add openclaw
unipet agent add deepseek-tui
```

Check the local runtime and connector setup:

```bash
unipet doctor
unipet agent status
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
| Custom agents | `unipet state ...` or HTTP | UniPet local protocol |

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
unipet demo
unipet state running "Running tests"
unipet state review "Ready for review"
unipet clear
```

The local bridge listens on:

```text
HTTP  http://127.0.0.1:8768
WS    ws://127.0.0.1:8769/ws
```

## Universal Protocol

Any tool can update the pet through the same event shape:

```bash
unipet state running "Running tests" --source my-agent
unipet state waiting "Waiting for approval" --source my-agent --ttl 2m
unipet state review "Ready for review" --source my-agent
```

For direct integrations, send local HTTP or WebSocket events with `source`,
`state`, `message`, `action`, and `ttl`. See [Protocol](docs/PROTOCOL.md).
For custom scripts and agents, see [Custom Agent Integration](docs/CUSTOM_AGENT.md).

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
unipet pet validate ./my-pet
unipet pet import ./my-pet --use
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

## Platforms

- Node.js 18+
- npm
- Windows, macOS, Linux, Unix, or WSL

UniPet can run on Windows, macOS, Linux, Unix, or WSL. Agent integrations are
optional; connect only the agents you actually use.

## For Developers

```bash
npm install
npm run check
npm start
```

`npm run check` runs the overlay tests and connector tests for OpenClaw,
DeepSeek-TUI, Codex, and Claude Code.

Useful project files:

- [Architecture](docs/ARCHITECTURE.md)
- [Protocol](docs/PROTOCOL.md)
- [Connectors](docs/CONNECTORS.md)
- [Custom Agent Integration](docs/CUSTOM_AGENT.md)
- [Pet Format](docs/PET_FORMAT.md)
- [Roadmap](ROADMAP.md)
- [Contributing](CONTRIBUTING.md)

<details>
<summary>Project layout</summary>

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

</details>

## Troubleshooting

- Run `unipet doctor` first. It checks the local bridge, runtime file, current
  pet, command setup, and prints a `next:` line with the recommended action.
- Run `unipet agent status` after installing connectors. Each connector prints
  its config path, managed hook/plugin state, and a `next:` line.
- If `127.0.0.1:8768` is already in use, run `unipet stop`, then `unipet start`.
- After installing a connector, restart the related agent session, gateway, or TUI.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Protocol](docs/PROTOCOL.md)
- [Connectors](docs/CONNECTORS.md)
- [Custom Agent Integration](docs/CUSTOM_AGENT.md)
- [Pet Format](docs/PET_FORMAT.md)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)

## License

MIT
