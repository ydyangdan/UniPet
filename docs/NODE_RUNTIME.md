# Node/Electron Runtime

UniPet no longer needs Python to run the desktop pet.

The lightweight runtime path is:

```text
Hermes / CLI
    |
    | HTTP POST localhost
    v
Electron main process
    - HTTP bridge :8768
    - WebSocket bridge :8769
    - TTL state store
    - transparent overlay window
```

## Why

The earlier MVP used Python for CLI + bridge and Electron for rendering. That meant users needed both Python 3.10+ and Node/Electron.

The current runtime folds the bridge into Electron's main process and replaces the CLI with a small dependency-free Node script:

```text
overlay/main.js   Electron app + local bridge
overlay/core.js   protocol normalization + state store
overlay/cli.js    launch/status/stop/emit/clear
```

Runtime dependencies are now:

```text
Node.js for development
Electron for desktop shell
ws for WebSocket server/client
```

Python remains only as legacy/reference code and for old tests. It is no longer required for normal use.

## Install

```powershell
cd D:\codex_info\UniPet\overlay
npm install
npm link
```

After `npm link`, the `unipet` command points to the Node CLI.

## Run

```powershell
unipet launch
unipet status
unipet emit running "Hermes 正在执行任务" --source hermes --label Hermes --ttl-ms 120000
unipet clear
unipet stop
```

You can also run without a global link:

```powershell
node D:\codex_info\UniPet\overlay\cli.js launch
node D:\codex_info\UniPet\overlay\cli.js emit running "Hermes 正在执行任务" --source hermes --label Hermes
```

## Tradeoff

Electron is still heavier than a native tray app. This change removes Python from the runtime and reduces the process count, but it does not make Electron itself lightweight.

Future lightweight options:

1. Keep Electron for MVP and package it cleanly.
2. Later evaluate Tauri/Wry if memory footprint becomes the top priority.
3. Keep the HTTP event protocol unchanged so the UI shell can be replaced without changing Hermes/OpenClaw connectors.
