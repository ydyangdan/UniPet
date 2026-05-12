# Hermes Skill Contract

Version: 0.2.0

This document defines how Hermes should drive UniPet without modifying Hermes core.

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
| planning, thinking | `review` or `running`; use `running` while actively working |
| success, done, completed | `review` |
| approval, confirm, blocked by user | `waiting` |
| error, exception, command failed | `failed` |

## Required Commands

Start or verify the pet:

```powershell
unipet launch
```

Send a running event:

```powershell
unipet emit running "正在处理任务" --source hermes --label Hermes --ttl-ms 120000
```

Send a waiting event:

```powershell
unipet emit waiting "等待用户确认" --source hermes --label Hermes
```

Send a finished/review event:

```powershell
unipet emit review "任务完成，请复查" --source hermes --label Hermes --ttl-ms 300000
```

Send a failed event:

```powershell
unipet emit failed "任务失败：简短原因" --source hermes --label Hermes --ttl-ms 300000
```

Reset state:

```powershell
unipet clear
```

## Event Rules

1. Call `unipet launch` once before the first event in a session.
2. Emit `running` before long command batches, code edits, builds, tests, or repository scans.
3. Emit `waiting` only when the next step truly needs user input.
4. Emit `review` only when the task is genuinely ready for user review.
5. Emit `failed` when the task cannot continue or a visible failure needs attention.
6. Use `--ttl-ms` for transient states so stale status does not linger.
7. Keep status messages short and non-sensitive.

## HTTP Equivalent

Hermes may use the CLI or HTTP. The CLI is preferred.

```json
{
  "protocol": "unipet.v1",
  "source_id": "hermes",
  "label": "Hermes",
  "state": "running",
  "message": "正在处理任务",
  "action": "update",
  "ttl_ms": 120000
}
```
