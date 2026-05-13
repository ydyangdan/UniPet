# Implementation Plan

This plan reflects the current Node.js + Electron direction.

## Phase 1: Usable Windows MVP

- Keep one runtime entry: `overlay/main.js`.
- Keep one CLI entry: `overlay/cli.js`.
- Support `launch`, `status`, `doctor`, `stop`, `clear`, and `emit`.
- Use the five Codex Pet states only.
- Install with `install.ps1` and `npm link`.
- Install Hermes integration as a skill, not by modifying Hermes core.

## Phase 2: Reliability

- Add packaging through `electron-builder` or Electron Forge.
- Add tray menu for status, restart, and quit.
- Persist selected pet asset and window position.
- Improve port conflict messages.
- Add CI checks for `npm run check`.

## Phase 3: Expansion

- Add OpenClaw skill/connector using the same event contract.
- Add multi-agent source display and simple source switching.
- Add pet asset import from Codex-compatible folders.
- Evaluate a lighter native shell only after the MVP behavior is stable.
