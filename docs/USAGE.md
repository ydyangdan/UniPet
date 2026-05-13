# UniPet Usage

UniPet uses a Node.js + Electron runtime. Python is not required to run UniPet.

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
3. Installs the Hermes plugin and skill unless skipped.
4. Enables the Hermes plugin when the `hermes` command is available.
5. Starts UniPet unless `-NoStart` or `--no-start` is used.

## Daily Commands

```powershell
unipet start
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

## Hermes Integration

Automatic integration uses the Hermes plugin at:

```text
$HERMES_HOME/plugins/unipet
```

The plugin registers Hermes lifecycle hooks and emits local HTTP events to UniPet. It can auto-start UniPet with `unipet start` if the bridge is not available.

Manual fallback uses the Hermes skill at:

```text
$HERMES_HOME/skills/unipet
```

Both are installed by:

```powershell
.\connectors\hermes\install.ps1
```

or:

```bash
./connectors/hermes/install.sh
```

After installing or enabling the plugin, start a new Hermes session so hooks are loaded.

## State Contract

Hermes and scripts should use only Codex Pet semantic states:

```text
idle
running
waiting
failed
review
```

The protocol layer accepts common aliases and maps them into those five states.

## Endpoints

```text
HTTP:      http://127.0.0.1:8768
WebSocket: ws://127.0.0.1:8769/ws
```

Useful checks:

```powershell
curl.exe http://127.0.0.1:8768/health
curl.exe http://127.0.0.1:8768/api/pet/view
```

## Render Scale

The default render scale is `0.5`, matching Codex Pet's smaller desktop size. To test another size:

```powershell
$env:UNIPET_RENDER_SCALE="0.6"
unipet start
```

Run `unipet stop` before restarting if an old window is still active.

## Diagnostics

```powershell
unipet doctor
where.exe unipet
```

The npm-linked command should be under the npm global prefix, usually `C:\Users\<you>\AppData\Roaming\npm`.
