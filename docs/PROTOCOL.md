# UniPet Bridge Protocol

UniPet connectors talk to the desktop overlay through a small localhost JSON
contract. The contract is intentionally agent-neutral: Hermes, OpenClaw,
DeepSeek-TUI, shell scripts, or future agents all send the same event shape.

## Version

Current protocol version: `1`.

The bridge keeps the version in code as `PROTOCOL_VERSION` and keeps the HTTP
payload small. Connectors do not need to send a protocol field.

## Endpoint

```text
POST http://127.0.0.1:8768/api/pet/events
Content-Type: application/json
```

## Event

```json
{
  "source": "hermes",
  "state": "running",
  "message": "Running tests",
  "action": "update",
  "ttlMs": 120000
}
```

Fields:

- `source`: required stable source id, such as `hermes`, `openclaw`, or
  `deepseek-tui`.
- `state`: one of `idle`, `running`, `waiting`, `failed`, `review`.
- `message`: short human text for the bubble and behavior hints.
- `action`: `update`, `remove`, or `clear`; defaults to `update`.
- `ttlMs`: optional expiry in milliseconds, clamped by the bridge.

Accepted state aliases include `thinking`, `planning`, `pending`, `error`,
`success`, and `done`. The bridge normalizes them into the five canonical
states before storing or broadcasting.

## Design Rules

- Keep connectors thin. Connectors translate upstream lifecycle events into
  this JSON event and do not know renderer animation details.
- Keep renderer local. The renderer can infer animation, emotion, and small
  motions from state plus message, but those are presentation concerns.
- Keep life behavior local. Short-lived mood, energy, attention, idle motions,
  and spritesheet rows are implementation details, not bridge fields.
- Keep sources independent. Each connector owns one or more source ids; the
  bridge chooses the active source by state priority and recency.
- Keep the bridge local-first. The default bind address is `127.0.0.1`.
