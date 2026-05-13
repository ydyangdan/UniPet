# Runnable MVP

This is the current working flow for the Windows-first UniPet MVP.

## Install

```powershell
cd D:\codex_info\UniPet
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Manual path:

```powershell
cd D:\codex_info\UniPet\overlay
npm install
npm link
```

## Run

```powershell
unipet launch
unipet status
unipet doctor
```

Default endpoints:

```text
HTTP:      http://127.0.0.1:8768
WebSocket: ws://127.0.0.1:8769/ws
```

## Drive The Pet

Use only Codex Pet semantic states:

```powershell
unipet emit running "Hermes is working" --source hermes --label Hermes --ttl-ms 120000
unipet emit waiting "Waiting for user confirmation" --source hermes --label Hermes
unipet emit failed "Task failed" --source hermes --label Hermes --ttl-ms 300000
unipet emit review "Done, please review" --source hermes --label Hermes --ttl-ms 300000
unipet clear
```

## Install Hermes Skill

PowerShell:

```powershell
.\connectors\hermes\install.ps1
```

Bash or WSL:

```bash
./connectors/hermes/install.sh
```

The installer copies the skill to:

```text
$HERMES_HOME/skills/unipet
```

If `HERMES_HOME` is not set, it uses:

```text
~/.hermes/skills/unipet
```

## Stop

```powershell
unipet stop
```
