# OpenClaw Connector

The OpenClaw connector mirrors OpenClaw conversation and agent lifecycle hooks into UniPet. It is a native OpenClaw plugin under `connectors/openclaw/plugin` and does not modify OpenClaw source code.

## Install

Windows:

```powershell
.\connectors\openclaw\install.ps1
```

Unix / WSL / macOS:

```bash
./connectors/openclaw/install.sh
```

The installer runs:

```text
openclaw plugins install -l <plugin-dir>
openclaw plugins enable unipet-openclaw
openclaw config validate
unipet start
```

Restart OpenClaw Gateway after installation so startup hooks are loaded.

## Event Mapping

UniPet keeps the Codex Pet state model:

```text
idle
running
waiting
failed
review
```

The OpenClaw connector maps hooks like this:

| OpenClaw hook | UniPet state | Message |
|---|---|---|
| `message_received` | `running` | OpenClaw received a message |
| `before_prompt_build` | `running` | OpenClaw is thinking |
| `before_tool_call` | `running` | Running tool: name |
| `after_tool_call` success | `running` | Tool finished: name |
| `after_tool_call` failure | `failed` | Tool failed: name |
| `message_sending` | `review` | First 20 characters of the outgoing reply |
| `message_processed` | `review` | First 20 characters of the processed reply |
| `message_sent` failure | `failed` | OpenClaw reply failed to send |
| `approval_required` | `waiting` | OpenClaw is waiting for approval |
| `agent_end` failure | `failed` | OpenClaw turn failed |

The plugin is best-effort. If UniPet is not running, OpenClaw continues normally and the connector only logs a debug message.

## Configuration

The defaults work for local use:

```text
UNIPET_HOST=127.0.0.1
UNIPET_PORT=8768
UNIPET_OPENCLAW_TIMEOUT_MS=350
UNIPET_OPENCLAW_BUBBLE_MODE=first20
UNIPET_OPENCLAW_BUBBLE_CHARS=20
UNIPET_OPENCLAW_PER_AGENT=0
```

Set `UNIPET_OPENCLAW_BUBBLE_MODE=off` to hide reply snippets. Set `UNIPET_OPENCLAW_PER_AGENT=1` to publish separate UniPet sources when OpenClaw hook payloads include an agent id.
