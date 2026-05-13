# UniPet Quickstart

This guide covers the current Node.js + Electron runtime. UniPet itself does not require Python.

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

This installs `overlay/` dependencies, links the global `unipet` command, installs the Hermes plugin and skill, enables the Hermes plugin when possible, and starts UniPet.

Install only the CLI/runtime:

```powershell
cd D:\codex_info\UniPet
powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoStart -NoHermesSkill
```

Unix/WSL:

```bash
cd /path/to/UniPet
./install.sh
```

## 3. Start

```powershell
unipet start
```

`start` is idempotent. Running it again keeps a healthy runtime and cleans stale old processes.

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

Standalone install:

```powershell
.\connectors\hermes\install.ps1
```

or:

```bash
./connectors/hermes/install.sh
```

The installer copies the Hermes plugin and skill:

```text
$HERMES_HOME/plugins/unipet
$HERMES_HOME/skills/unipet
```

If Hermes is on PATH, the installer also enables the plugin:

```powershell
hermes plugins enable unipet
```

Start a new Hermes session after enabling the plugin. The plugin sends lifecycle events to UniPet automatically. The skill contract remains available as a manual fallback.

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

## 7. Render Size

The default desktop pet is rendered at 0.5 scale: a 192 x 208 atlas cell appears as 96 x 104 on screen.

For testing, you can override it before starting UniPet:

```powershell
$env:UNIPET_RENDER_SCALE="0.5"
unipet start
```

Supported practical values are clamped between `0.35` and `1`.

## 8. Troubleshooting

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

The npm-linked command should be earlier than any old install. If the pet window is stale:

```powershell
unipet stop
unipet start
```
