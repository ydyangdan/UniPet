---
name: unipet
description: "Drive UniPet, a local Codex-compatible desktop pet, from Hermes Agent task lifecycle events."
version: 0.4.0
author: UniPet
license: MIT
platforms: [windows, wsl, linux, macos]
prerequisites:
  commands: [unipet]
metadata:
  hermes:
    tags: [desktop-pet, codex-pet, status, local-first, windows, wsl]
    requires_toolsets: [terminal]
---

# UniPet

UniPet shows Hermes task state in a local floating desktop pet.

This skill is the manual fallback contract. When the Hermes plugin `unipet` is installed and enabled, lifecycle hooks send these status events automatically.

It is zero-intrusion:

- Do not edit Hermes core files.
- Do not require a daemon inside Hermes.
- Use the local `unipet` CLI only.
- Keep messages short and do not include secrets.

## Startup

Before the first status event, make sure UniPet is running:

```bash
unipet start
```

`unipet start` is idempotent. If UniPet is already healthy, it keeps the current runtime.

## Required States

Use exactly the Codex Pet semantic states:

```text
idle
running
waiting
failed
review
```

Do not send non-Codex states such as `thinking`, `planning`, `success`, `listening`, or `speaking`.
If those concepts appear, map them to the five states above.

## Commands

When starting real work:

```bash
unipet state running "Hermes is working" --source hermes --ttl 2m
```

When waiting for user input, approval, credentials, or clarification:

```bash
unipet state waiting "Waiting for user confirmation" --source hermes
```

When work is complete and ready for user review:

```bash
unipet state review "Done, please review" --source hermes --ttl 12s
```

When a command, build, test, network call, or integration step fails:

```bash
unipet state failed "Task failed: short reason" --source hermes --ttl 20s
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

## Safety

- UniPet listens on localhost only.
- Do not modify Hermes core.
- Do not send secrets in the message text.
- Keep messages short; the bubble is for status, not logs.
