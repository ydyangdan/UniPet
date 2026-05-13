# Node/Electron Runtime

UniPet runs on Node.js + Electron. Python has been removed from the UniPet runtime and test path.

## Runtime Path

```text
Hermes plugin / Hermes skill / CLI / local script
    |
    | HTTP POST or unipet emit ...
    v
Electron main process
    - HTTP bridge :8768
    - WebSocket bridge :8769
    - TTL state store
    - transparent overlay window
    - scaled Codex pet renderer
```

## Files

```text
overlay/main.js     Electron app, localhost bridge, process lifecycle
overlay/core.js     protocol validation, state aliases, TTL store
overlay/cli.js      start/status/doctor/stop/emit/clear
overlay/renderer.js spritesheet animation, scaling, bubble UI
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
unipet start
unipet status
unipet emit running "Hermes is working" --source hermes --label Hermes --ttl-ms 120000
unipet clear
unipet stop
```

Run without a global link:

```powershell
node D:\codex_info\UniPet\overlay\cli.js start
node D:\codex_info\UniPet\overlay\cli.js emit running "Hermes is working" --source hermes --label Hermes
```

## Render Scale

The default `UNIPET_RENDER_SCALE` is `0.5`. It renders a 192 x 208 source cell as 96 x 104 CSS pixels and sizes the transparent Electron window around that display size.

## Tradeoff

Electron is heavier than a native shell, but it gives the fastest reliable Windows MVP and keeps the future Linux/macOS path straightforward. The protocol is intentionally shell-independent, so a later Tauri/Wry/native shell can reuse the same `unipet.v1` event contract.
