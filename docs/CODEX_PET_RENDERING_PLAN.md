# Codex Pet Rendering Alignment Plan

This plan records the source-backed rendering model UniPet should align with.
It replaces earlier assumptions with behavior observed in the local Codex source
snapshot under `D:\codex_info\programming\openai-codex-upstream`.

## Scope

Do not bump or publish `0.1.5` as part of this plan. Versioning, release notes,
and npm publishing stay paused until explicitly requested.

The immediate priority is rendering correctness and code simplification:

- Keep UniPet as a desktop overlay.
- Align pet asset semantics with Codex pet manifests.
- Let connectors continue sending only state and message.
- Move renderer behavior toward source-backed animation timing.
- Remove redundant renderer paths after the new timing model is covered.

## Codex Source Findings

Relevant upstream files:

| Source file | What UniPet should learn from it |
| --- | --- |
| `codex-rs/tui/src/pets/model.rs` | Pet manifest normalization, default animations, loop semantics, fallback validation, frame cache key |
| `codex-rs/tui/src/pets/ambient.rs` | Runtime animation selection, reduced motion, frame scheduling, layout-fit guard |
| `codex-rs/tui/src/pets/frames.rs` | Deterministic frame extraction cache from one spritesheet |
| `codex-rs/tui/src/pets/mod.rs` | Render state separation, image clear behavior, asset vs terminal render errors |
| `codex-rs/tui/src/pets/asset_pack.rs` | Versioned built-in asset cache, byte limit, dimension validation, atomic install |

Confirmed Codex model:

- `pet.json` uses a `frame` object and named animation tracks.
- Built-in geometry is `192 x 208` cells, `8 x 9` grid, `1536 x 1872` sheet.
- Animations are not row/fps-only. They are frame tracks with per-frame duration.
- `loop_start` defines the looping segment. A missing loop can finish and fall back.
- App-state animations repeat their primary action three times, then settle into the idle loop.
- Idle timing is intentionally calm: `[1680, 660, 660, 840, 840, 1920]`.
- Reduced motion uses a stable first frame and schedules no follow-up animation frame.
- Rendering has a state object that remembers what was drawn so stale images can be cleared.
- Built-in assets are validated and cached before the model layer loads them.

## Baseline Gaps and Batch Status

These were identified from `PROJECT_ANALYSIS_2026-06-01.md` plus the current
implementation:

- Done: `overlay/renderer.js` now calculates the visible frame from elapsed time
  and manifest-owned per-frame duration, including `loopStart` and fallback.
- Done: renderer-level `fps` and unused `tempo-*` intent paths were removed.
  `fps` remains only as a manifest compatibility input during normalization.
- Done: reduced motion now renders a stable first frame and avoids scheduling
  follow-up frame timers.
- Done: `overlay/pets.js` decodes local PNG/WebP dimensions during validation and
  rejects spritesheets that do not cover the Codex-compatible sheet.
- Done: `npm run smoke:overlay` starts a temporary local runtime and verifies
  state events plus current pet config.
- Done: market install now preserves an embedded remote manifest, attempts the
  adjacent `pet.json` beside a market spritesheet, and falls back to metadata
  when no manifest is available.
- Remaining: the renderer still combines animation playback, life intent,
  bubbles, drag behavior, idle moments, and visual effects in one large file.
  Further splitting should be done only when it clearly reduces complexity.
- Remaining: screenshot automation is still deferred until it is reliable on
  Windows.
- Ongoing: recovery handoff files are local working artifacts and must not enter
  Git or npm packages.

## Execution Plan

### Step 1: Document Source-Backed Rendering

Commit this document as the shared technical plan. Do not change runtime code in
this step.

### Step 2: Replace Frame-Counter Scheduling

Refactor the renderer animation controller so it stores:

- animation name
- animation start time
- current animation model
- reduced-motion flag
- fallback target

Calculate the visible frame from elapsed time and per-frame durations, including
`loopStart` and fallback behavior. Schedule the next frame using the remaining
duration for the currently visible frame, mirroring Codex's `current_animation_frame`
and `next_frame_delay` model.

Expected cleanup after this step:

- Prefer manifest frame durations over ad hoc `fps`.
- Keep `fps` only as a compatibility input during manifest normalization.
- Make one-shot animations finish via animation metadata instead of separate
  frame limits when possible.

### Step 3: Harden Pet Asset Validation

Bring UniPet closer to Codex's model/asset boundary:

- Decode spritesheet dimensions during validation/import.
- Keep the path traversal guard.
- Keep the file size limit.
- Add tests for invalid image dimensions and invalid fallback animation names.
- Add a local cache key helper based on spritesheet contents plus frame spec if
  a frame cache becomes useful for future runtimes.

### Step 4: Simplify Renderer Boundaries

After the scheduler is source-backed and tested:

- Split animation playback helpers from DOM event handling where useful.
- Remove redundant `fps` paths and temporary timers that duplicate manifest
  fallback behavior.
- Keep life intent separate from renderer details.
- Keep CSS effects modest and state-driven.

### Step 5: Add Visual Smoke Coverage

Add a small smoke path that can be run before release:

- Start the overlay.
- Send `idle`, `running`, `waiting`, `review`, and `failed` events.
- Verify the active pet config loads.
- Add screenshot automation only if it stays reliable on Windows.

`npm run smoke:overlay` now covers the local runtime, bridge view, state events,
and current pet config. Manual visual inspection is still useful for checking
transparent window placement, drag feel, and bubble overlap until screenshot
automation is reliable on Windows.

## Commit Strategy

Use small commits:

1. Documentation alignment.
2. Animation scheduler refactor and tests.
3. Pet validation and manifest tests.
4. Renderer cleanup.
5. Smoke/docs polish.

Run focused tests after each code commit. Run the full release confidence checks
only at the end of the batch:

```bash
npm test
npm run pack:dry
npm run smoke:install
npm run smoke:overlay
```

Again, do not bump or publish `0.1.5` until explicitly requested.
