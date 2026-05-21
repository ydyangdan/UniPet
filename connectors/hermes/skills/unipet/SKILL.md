---
name: unipet
description: "Drive UniPet, a local desktop pet for AI coding agents, through the shared agent state protocol."
version: 0.5.0
author: UniPet
license: MIT
platforms: [windows, wsl, linux, macos]
prerequisites:
  commands: [unipet]
metadata:
  hermes:
    tags: [desktop-pet, codex-pet, status, local-first, agent-state]
    requires_toolsets: [terminal]
---

# UniPet Agent Skill

UniPet shows AI agent status in a small local desktop pet. This skill is the
manual fallback for any agent that can run shell commands. When a native UniPet
connector is installed, hooks or plugins send these events automatically.

Use a stable source id for the current agent. In Hermes, use `hermes`.

## Rules

- Do not modify agent core files.
- Do not send secrets, logs, prompts, or large outputs in messages.
- Keep messages short enough for a desktop bubble.
- Use only the five canonical states: `idle`, `running`, `waiting`, `failed`,
  and `review`.
- Map similar terms into those states. For example, `thinking` and `planning`
  become `running`; `success` and `done` become `review`; `error` becomes
  `failed`.

## Commands

Start UniPet if needed:

```bash
unipet start
```

When real work starts:

```bash
unipet state running "Working on task" --source hermes
```

When waiting for user input, approval, credentials, or clarification:

```bash
unipet state waiting "Waiting for approval" --source hermes
```

When work is complete and ready for review:

```bash
unipet state review "Done, please review" --source hermes --ttl 12s
```

When a command, build, test, network call, or integration step fails:

```bash
unipet state failed "Task failed" --source hermes --ttl 20s
```

When explicitly asked to reset the pet:

```bash
unipet clear
```

## Diagnostics

```bash
unipet status
unipet doctor
curl -fsS http://127.0.0.1:8768/health
curl -fsS http://127.0.0.1:8768/api/pet/view
```
