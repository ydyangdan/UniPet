# Node/Electron Runtime

UniPet now runs on Node.js + Electron. Python has been removed from the active runtime and test path.

## Runtime Path

```text
Hermes / CLI / local script
    |
    | unipet emit ... or HTTP POST
    v
Electron main process
    - HTTP bridge :8768
    - WebSocket bridge :8769
    - TTL state store
    - transparent overlay window
```

## Files

```text
overlay/main.js     Electron app, localhost bridge, process lifecycle
overlay/core.js     protocol validation, state aliases, TTL store
overlay/cli.js      launch/status/doctor/stop/emit/clear
overlay/renderer.js spritesheet animation and bubble UI
overlay/preload.js  safe IPC surface for renderer
```

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
unipet emit running "Hermes is working" --source hermes --label Hermes --ttl-ms 120000
unipet clear
unipet stop
```

You can also run without a global link:

```powershell
node D:\codex_info\UniPet\overlay\cli.js launch
node D:\codex_info\UniPet\overlay\cli.js emit running "Hermes is working" --source hermes --label Hermes
```

## Tradeoff

Electron is heavier than a native tray app, but it gives the fastest reliable Windows MVP and keeps the future Linux/macOS path straightforward. The protocol is intentionally shell-independent, so a later Tauri/Wry/native shell can reuse the same `unipet.v1` event contract.
