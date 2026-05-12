# Runnable MVP

This is the current working flow for the Windows-first UniPet MVP.

## Install

From the project root:

```powershell
python -m pip install -e .
```

Install overlay dependencies if `overlay/node_modules` is missing:

```powershell
cd overlay
npm install
cd ..
```

## Run

```powershell
unipet launch
unipet status
```

The default endpoints are:

```text
HTTP:      http://127.0.0.1:8768
WebSocket: ws://127.0.0.1:8769/ws
```

## Drive The Pet

Use only Codex Pet semantic states:

```powershell
unipet emit running "Hermes 正在执行任务" --source hermes --label Hermes --ttl-ms 120000
unipet emit waiting "等待用户确认" --source hermes --label Hermes
unipet emit failed "任务失败" --source hermes --label Hermes --ttl-ms 300000
unipet emit review "完成，请复查" --source hermes --label Hermes --ttl-ms 300000
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

## Bridge Only

For WSL or headless checks:

```powershell
unipet launch --no-overlay
```

## Stop

```powershell
unipet stop
```
