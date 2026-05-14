# DeepSeek-TUI Connector

The DeepSeek-TUI connector mirrors DeepSeek-TUI lifecycle hooks into UniPet. It
does not modify DeepSeek-TUI source code. It only adds a UniPet-managed hook
block to the user's DeepSeek-TUI config file.

## Install

For npm installs:

```bash
unipet setup deepseek-tui
```

For source installs:

Windows:

```powershell
.\connectors\deepseek-tui\install.ps1
```

Unix / WSL / macOS:

```bash
./connectors/deepseek-tui/install.sh
```

The installer updates:

```text
~/.deepseek/config.toml
```

Pass a custom config path when DeepSeek-TUI is launched with
`DEEPSEEK_CONFIG_PATH` or `--config`:

```bash
unipet setup deepseek-tui --config /path/to/config.toml
```

Restart DeepSeek-TUI after installation so hooks are loaded.

## Event Mapping

UniPet keeps the Codex Pet state model:

```text
idle
running
waiting
failed
review
```

The DeepSeek-TUI connector maps hooks like this:

| DeepSeek-TUI hook | UniPet state | Message |
|---|---|---|
| `session_start` | `idle` | DeepSeek-TUI ready |
| `message_submit` | `running` | DeepSeek-TUI is thinking |
| `tool_call_before` | `running` | Running tool name |
| `tool_call_after` failure | `failed` | Tool failed |
| `tool_call_after` success | no event | Avoid noisy updates |
| `on_error` | `failed` | Error summary |
| `session_end` | cleanup | Remove DeepSeek-TUI source |

The connector is best-effort. If UniPet is not running, update events try to
start UniPet and retry once. Cleanup events never start UniPet.

## Configuration

Defaults:

```text
UNIPET_HOST=127.0.0.1
UNIPET_PORT=8768
UNIPET_DEEPSEEK_TUI_TIMEOUT_MS=350
UNIPET_DEEPSEEK_TUI_AUTO_START=1
UNIPET_DEEPSEEK_TUI_PER_SESSION=0
UNIPET_DEEPSEEK_TUI_SOURCE_ID=deepseek-tui
UNIPET_DEEPSEEK_TUI_LABEL=DeepSeek-TUI
```

Set `UNIPET_DEEPSEEK_TUI_PER_SESSION=1` to publish one UniPet source per
DeepSeek-TUI hook session id.

## Current Limit

DeepSeek-TUI's interactive hook events do not expose assistant response text, so
this connector cannot show the final LLM reply snippet yet. A future
`deepseek serve --http` SSE watcher can add reply bubbles from runtime events
without changing DeepSeek-TUI source code.
