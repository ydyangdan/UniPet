"""UniPet event bridge — HTTP event inlet + WebSocket broadcast.

Runs a localhost HTTP server (:8768) that receives PetEvent JSON from agents
and a WebSocket server that broadcasts state changes to the Electron overlay.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional

try:
    import websockets
    from websockets.server import WebSocketServerProtocol

    _WEBSOCKETS_AVAILABLE = True
except ImportError:
    _WEBSOCKETS_AVAILABLE = False

from .constants import (
    DEFAULT_BRIDGE_HOST,
    DEFAULT_BRIDGE_PORT,
    DEFAULT_WS_PORT,
    RUNTIME_FILENAME,
    get_unipet_home,
)
from .protocol import (
    PROTOCOL_VERSION,
    PetEvent,
    normalize_event,
)

logger = logging.getLogger("unipet.bridge")

MAX_BODY_BYTES = 64 * 1024

_LOCAL_SOURCE_ID = "local-unipet"
STATE_PRIORITY = {
    "failed": 50,
    "waiting": 40,
    "review": 30,
    "running": 20,
    "idle": 0,
}


# ---------------------------------------------------------------------------
# Runtime file management (for process discovery)
# ---------------------------------------------------------------------------
def runtime_file() -> Path:
    return get_unipet_home() / "runtime" / RUNTIME_FILENAME


def write_runtime(host: str, port: int, ws_port: int) -> Path:
    path = runtime_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    ws_url = f"ws://{host}:{ws_port}/ws"
    data = {
        "pid": os.getpid(),
        "host": host,
        "port": port,
        "ws_port": ws_port,
        "url": f"http://{host}:{port}/api/pet/view",
        "ws_url": ws_url,
        "updated_at": time.time(),
    }
    path.write_text(json.dumps(data, indent=2))
    return path


def remove_runtime() -> None:
    path = runtime_file()
    try:
        data = json.loads(path.read_text())
        if data.get("pid") == os.getpid():
            path.unlink(missing_ok=True)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Pet state store
# ---------------------------------------------------------------------------
class PetStore:
    """In-memory pet state, thread-safe."""

    def __init__(self) -> None:
        self.pets: dict[str, PetEvent] = {}
        self._lock = threading.RLock()

    def _purge_expired_locked(self) -> None:
        now = time.time()
        expired = [
            source_id
            for source_id, pet in self.pets.items()
            if pet.ttl_ms is not None and (pet.updated_at + pet.ttl_ms / 1000) <= now
        ]
        for source_id in expired:
            self.pets.pop(source_id, None)

    def apply(self, event: PetEvent) -> None:
        with self._lock:
            if event.action == "clear":
                local = self.pets.get(_LOCAL_SOURCE_ID)
                self.pets.clear()
                if local:
                    self.pets[_LOCAL_SOURCE_ID] = local
            elif event.action == "remove":
                self.pets.pop(event.source_id, None)
            else:  # update
                self.pets[event.source_id] = event

    def snapshot(self) -> list[dict]:
        with self._lock:
            self._purge_expired_locked()
            return [
                {
                    "source_id": p.source_id,
                    "label": p.label,
                    "state": p.state,
                    "message": p.message,
                    "animation": p.animation,
                    "direction": p.direction,
                    "asset_id": p.asset_id,
                    "notification_count": p.notification_count,
                    "notification_kind": p.notification_kind,
                    "notification_label": p.notification_label,
                    "ttl_ms": p.ttl_ms,
                    "updated_at": p.updated_at,
                }
                for p in self.pets.values()
            ]

    def active_pet(self) -> Optional[dict]:
        with self._lock:
            self._purge_expired_locked()
            if not self.pets:
                return None
            active = max(
                self.pets.values(),
                key=lambda p: (STATE_PRIORITY.get(p.state, 0), p.updated_at),
            )
            return {
                "source_id": active.source_id,
                "label": active.label,
                "state": active.state,
                "message": active.message,
                "animation": active.animation,
                "direction": active.direction,
                "asset_id": active.asset_id,
                "notification_count": active.notification_count,
                "notification_kind": active.notification_kind,
                "notification_label": active.notification_label,
                "ttl_ms": active.ttl_ms,
                "updated_at": active.updated_at,
            }

    def active_state(self) -> str:
        active = self.active_pet()
        return active["state"] if active else "idle"


# ---------------------------------------------------------------------------
# HTTP request handler
# ---------------------------------------------------------------------------
class BridgeHTTPHandler(BaseHTTPRequestHandler):
    """Minimal HTTP handler for /api/pet/events and /health."""

    def log_message(self, format, *args):
        logger.debug(format, *args)

    def _send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in {"", "/", "/health"}:
            self._send_json({
                "status": "ok",
                "pid": os.getpid(),
                "uptime": time.time() - self.server.start_time,  # type: ignore[attr-defined]
                "protocol": PROTOCOL_VERSION,
                "ws_url": self.server.ws_url,  # type: ignore[attr-defined]
            })
        elif self.path == "/api/pet/view":
            store = self.server.store  # type: ignore[attr-defined]
            self._send_json({
                "protocol": PROTOCOL_VERSION,
                "pets": store.snapshot(),
                "active_pet": store.active_pet(),
                "active_state": store.active_state(),
            })
        else:
            self._send_json({"error": "not found"}, status=404)

    def do_POST(self) -> None:
        if self.path != "/api/pet/events":
            self._send_json({"error": "not found"}, status=404)
            return

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BODY_BYTES:
            self._send_json({"error": "bad request"}, status=400)
            return

        body = self.rfile.read(length)
        try:
            payload = json.loads(body)
        except json.JSONDecodeError as e:
            self._send_json({"error": f"invalid json: {e}"}, status=400)
            return

        try:
            event = normalize_event(payload)
        except ValueError as e:
            self._send_json({"error": str(e)}, status=400)
            return

        store = self.server.store  # type: ignore[attr-defined]
        store.apply(event)

        self._send_json({
            "status": "ok",
            "pets": store.snapshot(),
            "active_pet": store.active_pet(),
            "active_state": store.active_state(),
        })


class BridgeHTTPServer(ThreadingHTTPServer):
    """HTTP server holding a shared PetStore and WebSocket server reference."""

    def __init__(self, host: str, port: int, ws_port: int, store: PetStore) -> None:
        super().__init__((host, port), BridgeHTTPHandler)
        self.store = store
        self.start_time = time.time()
        self.ws_url = f"ws://{host}:{ws_port}/ws"


# ---------------------------------------------------------------------------
# WebSocket server
# ---------------------------------------------------------------------------
async def _ws_handler(
    websocket: WebSocketServerProtocol,
    path: str | None,
    store: PetStore,
) -> None:
    """Handle a single WebSocket overlay client connection."""
    logger.info(f"Overlay connected: {websocket.remote_address}")
    try:
        await websocket.send(json.dumps({
            "type": "state_update",
            "pets": store.snapshot(),
            "active_pet": store.active_pet(),
            "active_state": store.active_state(),
        }))
        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            if data.get("type") == "ping":
                await websocket.send(json.dumps({
                    "type": "pong",
                    "active_pet": store.active_pet(),
                    "active_state": store.active_state(),
                    "pets": store.snapshot(),
                }))
    except websockets.exceptions.ConnectionClosed:
        logger.info("Overlay disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


async def _ws_broadcast(store: PetStore, clients: set[WebSocketServerProtocol]) -> None:
    """Poll the store for changes and broadcast to all overlay clients."""
    last_snapshot = json.dumps(store.snapshot(), sort_keys=True)
    while True:
        await asyncio.sleep(0.3)
        current = json.dumps(store.snapshot(), sort_keys=True)
        if current == last_snapshot:
            continue
        last_snapshot = current
        payload = json.dumps({
            "type": "state_update",
            "pets": store.snapshot(),
            "active_pet": store.active_pet(),
            "active_state": store.active_state(),
        })
        dead = set()
        for ws in clients:
            try:
                await ws.send(payload)
            except Exception:
                dead.add(ws)
        clients.difference_update(dead)


async def run_ws_server(host: str, port: int, store: PetStore) -> None:
    """Start the WebSocket server with broadcast loop."""
    clients: set[WebSocketServerProtocol] = set()

    async def handler(websocket: WebSocketServerProtocol, path: str | None = None) -> None:
        clients.add(websocket)
        await _ws_handler(websocket, path, store)
        clients.discard(websocket)

    asyncio.create_task(_ws_broadcast(store, clients))
    async with websockets.serve(handler, host, port):
        logger.info(f"WebSocket server on ws://{host}:{port}/ws")
        await asyncio.Future()  # run forever


def _run_ws_in_thread(host: str, port: int, store: PetStore) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run_ws_server(host, port, store))


# ---------------------------------------------------------------------------
# Bridge manager
# ---------------------------------------------------------------------------
class PetBridge:
    """Orchestrator: starts HTTP + WebSocket servers, manages lifecycle."""

    def __init__(
        self,
        host: str = DEFAULT_BRIDGE_HOST,
        port: int = DEFAULT_BRIDGE_PORT,
        ws_port: int = DEFAULT_WS_PORT,
    ) -> None:
        self.host = host
        self.port = port
        self.ws_port = ws_port
        self.store = PetStore()
        self._http_server: Optional[BridgeHTTPServer] = None
        self._ws_thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._http_server:
            return

        if not _WEBSOCKETS_AVAILABLE:
            logger.warning("websockets package not available, WebSocket disabled")

        # Write runtime file for process discovery.
        write_runtime(self.host, self.port, self.ws_port)

        # Start WebSocket server in background thread
        if _WEBSOCKETS_AVAILABLE:
            self._ws_thread = threading.Thread(
                target=_run_ws_in_thread,
                args=(self.host, self.ws_port, self.store),
                daemon=True,
            )
            self._ws_thread.start()

        # Start HTTP server
        self._http_server = BridgeHTTPServer(self.host, self.port, self.ws_port, self.store)
        logger.info(f"HTTP bridge listening on http://{self.host}:{self.port}")
        try:
            self._http_server.serve_forever()
        except KeyboardInterrupt:
            pass

    def stop(self) -> None:
        if self._http_server:
            self._http_server.shutdown()
            self._http_server = None
        remove_runtime()
        logger.info("Bridge stopped")

    def run_foreground(self) -> None:
        """Run the bridge in the foreground (blocks until Ctrl+C)."""
        signal.signal(signal.SIGINT, lambda sig, frame: self.stop())
        signal.signal(signal.SIGTERM, lambda sig, frame: self.stop())
        self.start()

    @classmethod
    def run_background(
        cls,
        host: str = DEFAULT_BRIDGE_HOST,
        port: int = DEFAULT_BRIDGE_PORT,
        ws_port: int = DEFAULT_WS_PORT,
    ) -> PetBridge:
        """Start the bridge in a background thread, return the bridge instance."""
        bridge = cls(host=host, port=port, ws_port=ws_port)
        thread = threading.Thread(target=bridge.start, daemon=True)
        thread.start()
        time.sleep(0.5)  # give servers a moment to start
        return bridge


# ---------------------------------------------------------------------------
# CLI entry for standalone `unipet-bridge` command
# ---------------------------------------------------------------------------
def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="UniPet event bridge")
    parser.add_argument("--host", default=DEFAULT_BRIDGE_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_BRIDGE_PORT)
    parser.add_argument("--ws-port", type=int, default=DEFAULT_WS_PORT)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    bridge = PetBridge(host=args.host, port=args.port, ws_port=args.ws_port)
    print(f"UniPet bridge: http://{args.host}:{args.port}  ws://{args.host}:{args.ws_port}/ws")
    bridge.run_foreground()


if __name__ == "__main__":
    main()
