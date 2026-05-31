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
  "frameWidth": 192,
  "frameHeight": 208,
  "columns": 8,
  "rows": 9
}
```

## Spritesheet

- Image type: `.webp` or `.png` is recommended.
- Frame size: `192 x 208`.
- Atlas size: `8 columns x 9 rows`.
- Current renderer states:
  `idle`, `running_right`, `running_left`, `waving`, `jumping`, `failed`,
  `waiting`, `running`, and `review`.

## Validate And Import

```bash
unipet pet validate ./my-pet
unipet pet import ./my-pet --use
```

`validate` checks the manifest, spritesheet path, file size, and renderer
geometry. `import` copies the pet into `~/.unipet/pets` and can hot-reload the
running overlay when `--use` is passed.

## Safety Rules

- `id` must be a local-safe id and cannot be `uni`, which is reserved for the
  built-in pet.
- `spritesheetPath` must stay inside the pet directory.
- Spritesheets larger than 16 MB are rejected.
- The current renderer is intentionally fixed to the Codex-compatible geometry
  so pet authors can build one asset and use it across compatible tools.
