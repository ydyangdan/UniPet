# UniPet

[中文文档](README_zh.md)

UniPet is a Universal Desktop Pet.

It is a lightweight, cross-platform Node.js + Electron desktop pet inspired by
Codex Pet. It runs locally and exposes a simple localhost bridge, so Hermes,
OpenClaw, DeepSeek-TUI, shell scripts, or your own agent can drive pet states
without modifying their core code.

![UniPet Hermes demo](docs/assets/unipet-hermes-demo.png)

## What It Does

- Shows a transparent, always-on-top desktop pet.
- Uses Codex Pet semantic states: `idle`, `running`, `waiting`, `failed`, and
  `review`.
- Displays short bubble messages from agent events.
- Supports hover/click jumping and draggable positioning.
- Installs, lists, switches, and removes local pets.
- Downloads Codex-compatible pets from the pet market.
- Integrates with Hermes, OpenClaw, and DeepSeek-TUI through optional
  zero-intrusion connectors.

UniPet itself does not require Python. The Hermes connector contains a tiny
Python plugin only because Hermes loads plugins in its own Python environment;
that plugin uses only Python standard library modules.

## Requirements

- Node.js 18+
- npm
- A desktop session that can run Electron

Platform notes:

- Windows is the primary tested target.
- macOS and Linux use the same Node.js/Electron runtime and `install.sh`.
- WSL needs WSLg or another working Linux GUI display.
- Hermes Agent, OpenClaw, and DeepSeek-TUI are optional. Install them only if you want automatic
  lifecycle integration.

## Install

For most users, install UniPet from npm:

```bash
npm install -g uni-pet
unipet start
```

Connect the agents you use:

```bash
unipet setup hermes
unipet setup openclaw
unipet setup deepseek-tui
```

Update later with:

```bash
npm update -g uni-pet
```

GitHub source install is mainly for development or trying unreleased changes.

Windows PowerShell:

```powershell
git clone https://github.com/ydyangdan/UniPet.git
cd UniPet
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Unix, macOS, Linux, or WSL:

```bash
git clone https://github.com/ydyangdan/UniPet.git
cd UniPet
./install.sh
```

The source installer runs `npm install`, links the global `unipet` command,
installs the Hermes connector by default, starts UniPet, and prints
`unipet doctor` output.

If you only want the desktop pet runtime and no Hermes files:

```powershell
.\install.ps1 -NoHermesSkill
```

```bash
./install.sh --no-hermes-skill
```

If a Unix checkout loses executable bits, run:

```bash
chmod +x ./install.sh ./connectors/hermes/install.sh ./connectors/openclaw/install.sh ./connectors/deepseek-tui/install.sh
```

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
unipet emit running "Hermes is working" --source hermes --label Hermes --ttl-ms 120000
unipet emit review "Ready for review" --source hermes --label Hermes --ttl-ms 300000
unipet clear
```

The local bridge listens on:

```text
HTTP  http://127.0.0.1:8768
WS    ws://127.0.0.1:8769/ws
```

## Pet Market

Browse and install online pets:

```bash
unipet market list
unipet market search cat
unipet market info anby
unipet market install anby --use
```

Manage local pets:

```bash
unipet pet list
unipet pet current
unipet pet use anby
unipet pet remove anby
```

Installed pets and user config live under `~/.unipet`.

## Hermes Integration

For npm installs, use:

```bash
unipet setup hermes
```

For source installs, the top-level installer installs the Hermes connector
automatically unless you pass `-NoHermesSkill` or `--no-hermes-skill`.

Standalone Hermes connector install:

```powershell
.\connectors\hermes\install.ps1
```

```bash
./connectors/hermes/install.sh
```

The installer copies:

```text
$HERMES_HOME/plugins/unipet
$HERMES_HOME/skills/unipet
```

When the `hermes` command is available, it also runs:

```bash
hermes plugins enable unipet
```

Start a new Hermes session after enabling the plugin. Hermes loads hooks per
session.

## OpenClaw Integration

OpenClaw support is optional and uses a native hook plugin. It does not modify
OpenClaw source code and has no npm runtime dependencies.

For npm installs, use:

```bash
unipet setup openclaw
```

For source installs, install UniPet and the OpenClaw plugin together:

```powershell
.\install.ps1 -OpenClawPlugin
```

```bash
./install.sh --openclaw-plugin
```

Standalone OpenClaw plugin install:

```powershell
.\connectors\openclaw\install.ps1
```

```bash
./connectors/openclaw/install.sh
```

Restart OpenClaw Gateway after enabling the plugin so startup hooks are loaded.

## DeepSeek-TUI Integration

DeepSeek-TUI support is optional and uses the official lifecycle hooks in
`~/.deepseek/config.toml`. It does not modify DeepSeek-TUI source code.

For npm installs, use:

```bash
unipet setup deepseek-tui
```

Standalone connector install:

```powershell
.\connectors\deepseek-tui\install.ps1
```

```bash
./connectors/deepseek-tui/install.sh
```

Restart DeepSeek-TUI after installation so hooks are loaded.

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
|   |-- tests/                       Node test suite
|   `-- assets/default/              bundled default pet
|-- connectors/hermes/               Hermes plugin and skill
|-- connectors/openclaw/             OpenClaw hook plugin
|-- connectors/deepseek-tui/             DeepSeek-TUI hook connector
|-- docs/                            design notes
|-- install.ps1                      Windows installer
`-- install.sh                       Unix installer
```

## Development

```bash
cd overlay
npm install
npm run check
npm start
```

Run connector tests:

```bash
node --test ../connectors/openclaw/plugin/tests/*.test.js
node --test ../connectors/deepseek-tui/tests/*.test.js
```

## Troubleshooting

- Run `unipet doctor` first. It checks the local bridge, runtime file, current
  pet, and command setup.
- If `127.0.0.1:8768` is already in use, stop the old UniPet process with
  `unipet stop`, then run `unipet start`.
- If Hermes, OpenClaw, or DeepSeek-TUI events do not show up, restart the agent session or
  gateway/TUI after installing/enabling the connector.
- If the pet does not appear on Linux or WSL, verify that Electron can open a GUI
  window in your desktop session.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Hermes Skill Contract](docs/HERMES_SKILL_CONTRACT.md)
- [OpenClaw Connector](docs/OPENCLAW_CONNECTOR.md)

- [DeepSeek-TUI Connector](docs/DEEPSEEK_TUI_CONNECTOR.md)

## License

MIT
