# UniPet Quickstart

This guide uses the current Node.js + Electron runtime. No Python setup is required.

## 1. Requirements

- Windows 10/11, WSL, Linux, or macOS
- Node.js 18+
- npm

Verify:

```powershell
node --version
npm --version
```

## 2. Install

Recommended Windows path:

```powershell
cd D:\codex_info\UniPet
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

This installs `overlay/` dependencies, links the global `unipet` command, installs the Hermes skill, and launches UniPet.

If you only want to install the CLI/runtime:

```powershell
cd D:\codex_info\UniPet
powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoLaunch -NoHermesSkill
```

Unix/WSL:

```bash
cd /path/to/UniPet
./install.sh
```

## 3. Launch

```powershell
unipet launch
```

`launch` is idempotent. Running it again keeps the current healthy runtime and cleans up stale old processes.

## 4. Send States

UniPet intentionally uses the same five Codex Pet semantic states:

```powershell
unipet emit idle "Ready"
unipet emit running "Working on the task" --source hermes --label Hermes --ttl-ms 120000
unipet emit waiting "Waiting for user confirmation" --source hermes --label Hermes
unipet emit failed "Task failed: short reason" --source hermes --label Hermes --ttl-ms 300000
unipet emit review "Done, please review" --source hermes --label Hermes --ttl-ms 300000
```

Common controls:

```powershell
unipet status
unipet doctor
unipet clear
unipet stop
```

## 5. Hermes Integration

Install the skill:

```powershell
.\connectors\hermes\install.ps1
```

or:

```bash
./connectors/hermes/install.sh
```

Hermes should call the CLI directly through the skill contract:

```powershell
unipet emit running "Hermes is working" --source hermes --label Hermes --ttl-ms 120000
unipet emit waiting "Waiting for input" --source hermes --label Hermes
unipet emit review "Done, please review" --source hermes --label Hermes --ttl-ms 300000
unipet emit failed "Task failed: short reason" --source hermes --label Hermes --ttl-ms 300000
```

## 6. HTTP API

The CLI wraps a local HTTP endpoint. Scripts can call it directly:

```powershell
curl.exe -X POST http://127.0.0.1:8768/api/pet/events `
  -H "Content-Type: application/json" `
  -d "{\"protocol\":\"unipet.v1\",\"source_id\":\"hermes\",\"state\":\"running\",\"message\":\"Hermes is working\"}"
```

Useful endpoints:

```text
GET  http://127.0.0.1:8768/health
GET  http://127.0.0.1:8768/api/pet/view
WS   ws://127.0.0.1:8769/ws
```

## 7. Troubleshooting

Run:

```powershell
unipet doctor
```

If the command is missing:

```powershell
cd D:\codex_info\UniPet\overlay
npm install
npm link
```

If `unipet doctor` shows an old command or does not support `doctor`, check PATH:

```powershell
where.exe unipet
```

If a previous Python install appears before the npm command, remove the old package or move npm earlier in PATH.

If the pet window is stale:

```powershell
unipet stop
unipet launch
```
