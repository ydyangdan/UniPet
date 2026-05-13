# UniPet Usage

UniPet uses the Node/Electron runtime. Python is not required.

## One-Time Install

Windows PowerShell:

```powershell
cd D:\codex_info\UniPet
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOS/Linux/WSL shell:

```bash
cd /path/to/UniPet
./install.sh
```

The installer:

1. Installs Electron dependencies in `overlay/`.
2. Links the `unipet` command with npm.
3. Installs the Hermes skill to `$HERMES_HOME/skills/unipet` or `~/.hermes/skills/unipet`.
4. Launches UniPet unless `-NoLaunch` or `--no-launch` is used.

## Daily Commands

```powershell
unipet launch
unipet status
unipet doctor
unipet clear
unipet stop
```

Send states:

```powershell
unipet emit running "Hermes is working" --source hermes --label Hermes --ttl-ms 120000
unipet emit waiting "Waiting for user confirmation" --source hermes --label Hermes
unipet emit failed "Task failed" --source hermes --label Hermes --ttl-ms 300000
unipet emit review "Done, please review" --source hermes --label Hermes --ttl-ms 300000
```

## Hermes Contract

Hermes should use only Codex Pet semantic states:

```text
idle
running
waiting
failed
review
```

The full contract is in `docs/HERMES_SKILL_CONTRACT.md`.

## Endpoints

```text
HTTP:      http://127.0.0.1:8768
WebSocket: ws://127.0.0.1:8769/ws
```

## Diagnostics

```powershell
unipet doctor
curl.exe http://127.0.0.1:8768/health
curl.exe http://127.0.0.1:8768/api/pet/view
```

If `unipet` resolves to an older command, check:

```powershell
where.exe unipet
```

The npm-linked command should be under the npm global prefix, usually `C:\Users\<you>\AppData\Roaming\npm`.
