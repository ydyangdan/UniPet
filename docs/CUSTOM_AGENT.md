# Custom Agent Integration

UniPet exposes a small local protocol so any agent, script, or tool can drive
the desktop pet without modifying UniPet internals.

## Quick Demo

```bash
unipet start
unipet demo
```

## CLI Events

```bash
unipet state running "Running tests" --source my-agent
unipet state waiting "Waiting for approval" --source my-agent --ttl 2m
unipet state review "Ready for review" --source my-agent --ttl 12s
unipet state failed "Tests failed" --source my-agent --ttl 20s
unipet clear
```

## HTTP Events

```bash
curl -X POST http://127.0.0.1:8768/api/pet/events \
  -H "Content-Type: application/json" \
  -d '{
    "source": "my-agent",
    "state": "running",
    "message": "Running tests",
    "action": "update",
    "ttl": "30s"
  }'
```

## Event Shape

```json
{
  "source": "my-agent",
  "state": "running",
  "message": "Running tests",
  "action": "update",
  "ttl": "30s"
}
```

Fields:

- `source`: stable id for the agent or script.
- `state`: `idle`, `running`, `waiting`, `failed`, or `review`.
- `message`: short bubble text.
- `action`: `update`, `remove`, or `clear`. Defaults to `update`.
- `ttl`: optional expiry, such as `30s`, `2m`, or `120000`.

The renderer owns animation and emotion. Custom agents should not send
renderer-specific fields.

## Cleanup

Remove one source when a session ends:

```bash
curl -X POST http://127.0.0.1:8768/api/pet/events \
  -H "Content-Type: application/json" \
  -d '{"source":"my-agent","state":"idle","message":"done","action":"remove"}'
```

Clear all non-local state:

```bash
unipet clear
```

## Examples

- [`examples/shell-demo.sh`](../examples/shell-demo.sh)
- [`examples/node-demo.js`](../examples/node-demo.js)
- [`examples/curl-event.json`](../examples/curl-event.json)
