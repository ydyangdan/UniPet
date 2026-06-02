# Changelog

## 0.1.5 - 2026-06-02

- Aligned the spritesheet renderer with Codex-style pet manifests, including
  manifest frame durations, loop starts, and safer fallback animation behavior.
- Added a lightweight hover/click status card that shows the active Agent
  source, display status, task summary, and elapsed time without inventing
  unavailable CPU, memory, or progress data.
- Improved companion status expression with grounded short bubble copy for
  running, thinking, waiting, confirmation, completion, and problem states.
- Preserved embedded Codex Pet Share manifests during pet installs and added
  stronger validation for custom pet assets.
- Refined the demo GIF and docs around the Agent state visualization experience.
- Added overlay smoke coverage to verify the local bridge and core state flow.

## 0.1.4 - 2026-05-31

- Added GitHub Actions CI across Windows, macOS, and Linux.
- Added GitHub issue templates, pull request template, contribution guide, and
  security policy.
- Added `unipet demo` for a quick local status visualization walkthrough.
- Improved companion behavior planning, idle moments, hover/drag feedback, and
  bubble timing while keeping the bridge protocol unchanged.
- Improved `unipet doctor` and `unipet agent status` guidance with actionable
  `next:` suggestions.
- Added `unipet pet validate` and `unipet pet import` for local pet authors.
- Fixed Unix process liveness detection when process probes return `EPERM`.

## 0.1.3

- Refreshed README and Chinese README for the universal agent positioning.
- Added Codex and Claude Code connectors.
- Simplified the public CLI around `agent`, `pet`, and `state`.
- Published the npm package as `uni-pet`.
