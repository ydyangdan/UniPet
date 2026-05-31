# Contributing to UniPet

Thanks for helping improve UniPet. The project is intentionally small: a local
desktop runtime, a stable bridge protocol, and thin zero-intrusion connectors.

## Development Setup

```bash
git clone https://github.com/ydyangdan/UniPet.git
cd UniPet
npm install
npm run check
```

Run the desktop overlay during development:

```bash
npm start
```

Run a local demo event sequence:

```bash
node overlay/cli.js demo
```

## Project Boundaries

- Keep the bridge protocol small: `source`, `state`, `message`, `action`, and
  `ttl`.
- Keep connectors thin. They should translate agent lifecycle events and avoid
  renderer-specific fields.
- Keep agent integrations zero-intrusion. Do not patch upstream agent source
  files.
- Prefer local-first behavior. UniPet should not send telemetry or remote
  events.
- Add focused tests for protocol, connector, pet, and CLI behavior.

## Connector Checklist

When adding or changing a connector:

1. Use a stable source id, such as `codex` or `claude-code`.
2. Map native lifecycle events into the five canonical states: `idle`,
   `running`, `waiting`, `failed`, and `review`.
3. Keep messages short enough for the pet bubble.
4. Provide install, disable, and remove behavior.
5. Add tests for hook payload mapping and managed config edits.
6. Document setup and known limitations in `docs/CONNECTORS.md`.

## Pull Requests

Before opening a pull request:

```bash
npm run check
npm run pack:dry
```

Describe the user-facing change, the files touched, and the verification you
ran. Screenshots or short GIFs are useful for rendering changes.
