# UniPet Connectors

UniPet connectors translate agent lifecycle events into the shared bridge
protocol. They are local, best-effort, and zero-intrusion: connectors use hooks,
plugins, or managed config blocks instead of patching upstream agent source.

## Commands

```bash
unipet agent list
unipet agent status
unipet agent add codex
unipet agent add claude-code
unipet agent add hermes
unipet agent add openclaw
unipet agent add deepseek-tui
unipet agent disable codex
unipet agent remove codex
```

Use `all` as the target when you intentionally want to act on every supported
agent.

## Supported Agents

| Agent | Install | Integration | Source id |
| --- | --- | --- | --- |
| Codex | `unipet agent add codex` | lifecycle hooks | `codex` |
| Claude Code | `unipet agent add claude-code` | lifecycle hooks | `claude-code` |
| Hermes | `unipet agent add hermes` | plugin | `hermes` |
| OpenClaw | `unipet agent add openclaw` | native plugin | `openclaw` |
| DeepSeek-TUI | `unipet agent add deepseek-tui` | managed hooks block | `deepseek-tui` |
| Custom agent | HTTP or `unipet state` | direct bridge events | chosen by caller |

Restart the related agent session, gateway, or TUI after installing a connector
so its hooks or plugin startup path are loaded.

## Lifecycle Mapping

All connectors map their native events into the same five UniPet states:

| UniPet state | Typical upstream events |
| --- | --- |
| `idle` | session ready, source cleanup |
| `running` | user prompt submitted, prompt build, tool start, active work |
| `waiting` | permission, approval, user input, blocked interaction |
| `failed` | tool failure, command failure, agent error |
| `review` | assistant reply ready, task complete, review needed |

Connectors should keep messages short. The bridge stores only local state and
the renderer decides animation, bubble style, and small companion motions.

## Manual Events

Custom agents and scripts can use the CLI:

```bash
unipet state running "Running tests" --source my-agent
unipet state waiting "Waiting for approval" --source my-agent --ttl 2m
unipet state review "Done, please review" --source my-agent --ttl 12s
unipet state failed "Tests failed" --source my-agent --ttl 20s
unipet clear
```

For direct HTTP integration, use the bridge protocol in
[`PROTOCOL.md`](PROTOCOL.md).

## Agent Notes

Codex and Claude Code connectors install managed hook blocks into their normal
configuration files. The hook command remains internal: `unipet hook ...` is for
agent runtimes, not daily user interaction.

Hermes installs a small Python plugin because Hermes loads plugins in its own
Python environment. That plugin only uses Python standard library modules and
does not require changes to Hermes core code.

OpenClaw uses a native plugin under `connectors/openclaw/plugin`. It can show
the first part of outgoing replies in the pet bubble when the upstream event
payload exposes text.

DeepSeek-TUI uses a managed hook block in the user's config. Its current hooks
do not expose final assistant reply text, so the connector focuses on active
work, failures, and cleanup events.
