# Implementation Plan

This plan reflects the current Node.js + Electron direction.

## Phase 1: Usable Windows MVP

Completed:

- Keep one runtime entry: `overlay/main.js`.
- Keep one CLI entry: `overlay/cli.js`.
- Support `start`, `status`, `doctor`, `stop`, `clear`, and `emit`.
- Use the five Codex Pet states only.
- Install with `install.ps1` / `install.sh` and `npm link`.
- Install Hermes integration without modifying Hermes core.
- Add Hermes plugin lifecycle hooks.
- Keep Hermes skill as a manual fallback.
- Render the pet at Codex-like desktop size with default scale `0.5`.

## Phase 2: Release Hardening

- Add packaging through `electron-builder` or Electron Forge.
- Add tray menu for status, restart, and quit.
- Persist selected pet asset.
- Improve port conflict messages.
- Add GitHub Actions for `npm run check`.
- Add release screenshots or GIFs.

## Phase 3: Expansion

- Add OpenClaw skill/connector using the same event contract.
- Add multi-agent source display and simple source switching.
- Add pet asset import from Codex-compatible folders.
- Evaluate a lighter native shell only after the MVP behavior is stable.
