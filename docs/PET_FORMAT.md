# UniPet Pet Format

UniPet uses a small Codex-compatible spritesheet format. A pet is a directory
with a `pet.json` file and one spritesheet image.

```text
my-pet/
|-- pet.json
`-- spritesheet.webp
```

Minimal `pet.json`:

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A local UniPet skin.",
  "spritesheetPath": "spritesheet.webp",
  "frame": {
    "width": 192,
    "height": 208,
    "columns": 8,
    "rows": 9
  },
  "animations": {
    "wave": {
      "frames": [24, 25, 26, 27],
      "fps": 8,
      "loop": false,
      "fallback": "idle"
    }
  }
}
```

## Spritesheet

- Image type: `.webp` or `.png` is recommended.
- Frame size: `192 x 208`.
- Atlas size: `8 columns x 9 rows`.
- Current renderer states:
  `idle`, `running_right`, `running_left`, `waving`, `jumping`, `failed`,
  `waiting`, `running`, and `review`.
- `frameWidth`, `frameHeight`, `columns`, and `rows` are still accepted for
  older UniPet manifests. New pets should prefer the Codex-style `frame` object.

## Animations

Animations are Codex-style tracks. A track can use a compact frame list plus
`fps`, or explicit frame durations:

```json
{
  "animations": {
    "idle": {
      "frames": [
        { "spriteIndex": 0, "durationMs": 1680 },
        { "spriteIndex": 1, "durationMs": 660 }
      ],
      "loop_start": 0
    },
    "jumping": {
      "frames": [32, 33, 34, 35, 36],
      "fps": 8,
      "loop": false,
      "fallback": "idle"
    }
  }
}
```

`loop_start` and `loopStart` are both accepted. Set `loop` to `false`, or
`loop_start` to `null`, for one-shot animations that should fall back to `idle`.

## Validate And Import

```bash
unipet pet validate ./my-pet
unipet pet import ./my-pet --use
```

`validate` checks the manifest, spritesheet path, file size, and renderer
geometry. `import` copies the pet into `~/.unipet/pets`, preserves the original
animation manifest, and can hot-reload the running overlay when `--use` is
passed.

## Safety Rules

- `id` must be a local-safe id and cannot be `uni`, which is reserved for the
  built-in pet.
- `spritesheetPath` must stay inside the pet directory.
- Spritesheets larger than 16 MB are rejected.
- The current renderer is intentionally fixed to the Codex-compatible geometry
  so pet authors can build one asset and use it across compatible tools.
