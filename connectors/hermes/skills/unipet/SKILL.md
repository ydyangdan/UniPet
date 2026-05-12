---
name: unipet
description: "Drive UniPet, a local Codex-compatible desktop pet, from Hermes Agent task lifecycle events."
version: 0.2.0
author: UniPet
license: MIT
platforms: [windows, wsl]
prerequisites:
  commands: [unipet]
metadata:
  hermes:
    tags: [desktop-pet, codex-pet, status, local-first, windows, wsl]
    requires_toolsets: [terminal]
---

# UniPet

UniPet shows Hermes task state in a local floating desktop pet.
It is zero-intrusion: do not edit Hermes core files. Use terminal commands only.

## Required Convention

Use exactly the Codex Pet semantic states:

| Moment in Hermes work | Command |
|---|---|
| Before starting a user task or tool-heavy step | `unipet emit running "正在处理任务" --source hermes --label Hermes --ttl-ms 120000` |
| When waiting for user input, approval, credentials, or clarification | `unipet emit waiting "等待用户确认" --source hermes --label Hermes` |
| When work is complete and ready for user review | `unipet emit review "任务完成，请复查" --source hermes --label Hermes --ttl-ms 300000` |
| When a command, build, test, network call, or integration step fails | `unipet emit failed "任务失败：简短原因" --source hermes --label Hermes --ttl-ms 300000` |
| When explicitly asked to reset the pet | `unipet clear` |

Do not send non-Codex states such as `thinking`, `success`, `listening`, or `speaking`.
If the user mentions those concepts, map them to the five states above.

## Startup

At the beginning of a Hermes session, or before the first status event, ensure UniPet is running:

```bash
unipet launch
```

`unipet launch` is idempotent. If UniPet is already running, it keeps the bridge and replaces stale overlay processes.

## Normal Flow

For a typical task:

```bash
unipet launch
unipet emit running "正在分析项目" --source hermes --label Hermes --ttl-ms 120000
# do the work
unipet emit review "完成，请复查" --source hermes --label Hermes --ttl-ms 300000
```

For a blocker:

```bash
unipet emit waiting "等待用户提供配置" --source hermes --label Hermes
```

For a failure:

```bash
unipet emit failed "测试失败" --source hermes --label Hermes --ttl-ms 300000
```

## Diagnostics

```bash
unipet status
curl -fsS http://127.0.0.1:8768/health
curl -fsS http://127.0.0.1:8768/api/pet/view
```

## Safety

- UniPet listens on localhost only.
- Do not modify Hermes core.
- Do not send secrets in the message text.
- Keep messages short; the bubble is for status, not logs.
