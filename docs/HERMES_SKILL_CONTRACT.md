# Hermes Skill Contract

Version: 0.4.0

This document defines the manual fallback contract for driving UniPet from Hermes without modifying Hermes core. The preferred path is now the Hermes plugin at `connectors/hermes/plugins/unipet`, which emits these same events automatically through lifecycle hooks.

## State Model

UniPet intentionally uses the same five semantic states as Codex Pet:

| State | Meaning | Codex animation row |
|---|---|---|
| `idle` | No active work | row 0 |
| `running` | Hermes is working | row 7 |
| `waiting` | Hermes is waiting for user input or approval | row 6 |
| `failed` | The current task hit an error or blocker | row 5 |
| `review` | Work is done and ready for review | row 8 |

Do not introduce Hermes-specific states in the first version. Map them instead:

| Hermes term | UniPet state |
|---|---|
| planning, thinking | `running` |
| success, done, completed | `review` |
| approval, confirm, blocked by user | `waiting` |
| error, exception, command failed | `failed` |

## Plugin Hook Mapping

The Hermes plugin uses this approximate mapping:

| Hermes hook | UniPet event |
|---|---|
| `on_session_start` | `running` |
| `pre_llm_call` | `running` |
| `pre_tool_call` | `running` |
| `post_tool_call` with error-like result | `failed` |
| `pre_approval_request` | `waiting` |
| `post_approval_response` | `running` or `failed` |
| `post_llm_call` | `review` |
| `on_session_end` interrupted | `waiting` |
| `on_session_end` incomplete | `failed` |
| `on_session_finalize` / `on_session_reset` | remove Hermes source |

## Required Commands

Start or verify the pet:

```powershell
unipet start
```

Send a running event:

```powershell
unipet emit running "Processing task" --source hermes --ttl-ms 120000
```

Send a waiting event:

```powershell
unipet emit waiting "Waiting for user confirmation" --source hermes
```

Send a finished/review event:

```powershell
unipet emit review "Task complete, please review" --source hermes --ttl-ms 300000
```

Send a failed event:

```powershell
unipet emit failed "Task failed: short reason" --source hermes --ttl-ms 300000
```

Reset state:

```powershell
unipet clear
```

## Event Rules

1. Call `unipet start` once before the first event in a session if the plugin is not installed.
2. Emit `running` before long command batches, code edits, builds, tests, or repository scans.
3. Emit `waiting` only when the next step truly needs user input.
4. Emit `review` only when the task is genuinely ready for user review.
5. Emit `failed` when the task cannot continue or a visible failure needs attention.
6. Use `--ttl-ms` for transient states so stale status does not linger.
7. Keep status messages short and non-sensitive.

## HTTP Equivalent

Hermes may use the CLI or HTTP. The plugin uses HTTP directly; the skill fallback should use the CLI because it auto-starts the runtime.

```json
{
  "source": "hermes",
  "state": "running",
  "message": "Processing task",
  "action": "update",
  "ttlMs": 120000
}
```
