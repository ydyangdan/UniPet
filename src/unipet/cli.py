"""UniPet CLI — command-line entry point.

Usage:
    unipet                  Show status
    unipet status           Show bridge/overlay status
    unipet launch           Start bridge + overlay in background
    unipet stop             Stop bridge + overlay
    unipet emit <s> <msg>   Send a state event to the bridge
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any, Optional

from .constants import (
    DEFAULT_BRIDGE_HOST,
    DEFAULT_BRIDGE_PORT,
    DEFAULT_WS_PORT,
    RUNTIME_FILENAME,
    get_unipet_home,
)
from .protocol import PROTOCOL_VERSION


def _configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Runtime helpers
# ---------------------------------------------------------------------------
def _runtime_data() -> Optional[dict[str, Any]]:
    path = get_unipet_home() / "runtime" / RUNTIME_FILENAME
    try:
        data = json.loads(path.read_text())
    except Exception:
        return None
    pid = data.get("pid")
    if isinstance(pid, int) and not _process_exists(pid):
        return None
    return data


def _update_runtime(**fields: Any) -> None:
    path = get_unipet_home() / "runtime" / RUNTIME_FILENAME
    try:
        data = json.loads(path.read_text())
    except Exception:
        data = {}
    data.update(fields)
    data["updated_at"] = time.time()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _process_exists(pid: Any) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    if os.name == "nt":
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                timeout=3,
            )
            return str(pid) in result.stdout
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _terminate_process(pid: Any) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
        else:
            os.kill(pid, signal.SIGTERM)
        return True
    except Exception:
        return False


def _matching_process_pids(tokens: tuple[str, ...]) -> list[int]:
    if os.name != "nt":
        return []
    try:
        result = subprocess.run(
            ["wmic", "process", "get", "ProcessId,CommandLine", "/format:list"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return []

    pids: list[int] = []
    last_command = ""
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if line.startswith("CommandLine="):
            last_command = line.split("=", 1)[1]
        elif line.startswith("ProcessId="):
            pid = line.split("=", 1)[1]
            command = last_command.replace("/", "\\").lower()
            if any(token.lower() in command for token in tokens) and pid.isdigit():
                pids.append(int(pid))
            last_command = ""
    return sorted(set(pids))


def _bridge_process_pids() -> list[int]:
    return _matching_process_pids(("unipet.bridge", "unipet-bridge"))


def _overlay_process_pids() -> list[int]:
    return _matching_process_pids(("unipet-overlay", "\\unipet\\overlay", "\\unipet\\overlay\\"))


def _stop_bridge_processes(except_pid: Optional[int] = None) -> None:
    for pid in _bridge_process_pids():
        if pid != except_pid:
            _terminate_process(pid)


def _stop_overlay_processes(except_pid: Optional[int] = None) -> None:
    for pid in _overlay_process_pids():
        if pid != except_pid:
            _terminate_process(pid)


def _send_event(host: str, port: int, payload: dict) -> dict:
    url = f"http://{host}:{port}/api/pet/events"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def _health_check(host: str, port: int) -> Optional[dict]:
    try:
        url = f"http://{host}:{port}/health"
        with urllib.request.urlopen(url, timeout=3) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _find_executable(name: str) -> Optional[str]:
    import shutil
    return shutil.which(name)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_status(args: Any) -> int:
    rt = _runtime_data()
    if not rt:
        print("UniPet: not running")
        return 0

    host = rt.get("host", DEFAULT_BRIDGE_HOST)
    port = rt.get("port", DEFAULT_BRIDGE_PORT)
    ws_url = rt.get("ws_url", f"ws://{host}:{rt.get('ws_port', DEFAULT_WS_PORT)}/ws")
    health = _health_check(host, port)

    print(f"UniPet running: pid={rt.get('pid')}  http://{host}:{port}")
    print(f"  websocket: {ws_url}")
    if rt.get("overlay_pid"):
        print(f"  overlay pid: {rt.get('overlay_pid')}")
    if health:
        print(f"  uptime: {health.get('uptime', 0):.0f}s")
        try:
            view_url = f"http://{host}:{port}/api/pet/view"
            with urllib.request.urlopen(view_url, timeout=3) as resp:
                view = json.loads(resp.read())
                active = view.get("active_state", "idle")
                print(f"  active state: {active}")
                for p in view.get("pets", []):
                    print(f"  [{p['source_id']}] {p['state']}: {p['message'][:60]}")
        except Exception:
            pass
    return 0


def cmd_launch(args: Any) -> int:
    host = args.host or DEFAULT_BRIDGE_HOST
    port = args.port or DEFAULT_BRIDGE_PORT
    ws_port = args.ws_port or DEFAULT_WS_PORT

    rt = _runtime_data()
    health = _health_check(rt.get("host", host), rt.get("port", port)) if rt else None
    runtime_matches_health = (
        bool(rt)
        and bool(health)
        and health.get("pid") == rt.get("pid")
        and bool(health.get("ws_url"))
    )
    if rt and runtime_matches_health:
        host = rt.get("host", host)
        port = rt.get("port", port)
        ws_port = rt.get("ws_port", ws_port)
        _stop_bridge_processes(except_pid=rt.get("pid"))
        _stop_overlay_processes()
        print(f"UniPet bridge already running: http://{host}:{port}")
    else:
        _stop_bridge_processes()
        _stop_overlay_processes()
        runtime_dir = get_unipet_home() / "runtime"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        log_path = runtime_dir / "bridge.log"
        log_file = log_path.open("a", encoding="utf-8")
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        cmd = [
            sys.executable,
            "-m",
            "unipet.bridge",
            "--host",
            host,
            "--port",
            str(port),
            "--ws-port",
            str(ws_port),
        ]
        subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=log_file,
            creationflags=creationflags,
        )
        log_file.close()
        for _ in range(30):
            if _health_check(host, port):
                break
            time.sleep(0.2)
        else:
            print(f"Bridge failed to start. See log: {log_path}", file=sys.stderr)
            return 1

    if args.no_overlay:
        print("  Overlay skipped")
    else:
        overlay_pid = _maybe_launch_overlay(host=host, port=port, ws_port=ws_port)
        if overlay_pid:
            _update_runtime(overlay_pid=overlay_pid)
    print(f"UniPet launched: http://{host}:{port}")
    return 0


def cmd_stop(args: Any) -> int:
    rt = _runtime_data()
    if not rt:
        _stop_bridge_processes()
        _stop_overlay_processes()
        print("UniPet: not running")
        return 0

    overlay_pid = rt.get("overlay_pid")
    if overlay_pid:
        _terminate_process(overlay_pid)
    _stop_overlay_processes()

    pid = rt.get("pid")
    if isinstance(pid, int) and _terminate_process(pid):
        print(f"UniPet stopped (pid {pid})")
    _stop_bridge_processes()

    runtime_path = get_unipet_home() / "runtime" / RUNTIME_FILENAME
    runtime_path.unlink(missing_ok=True)
    return 0


def cmd_emit(args: Any) -> int:
    rt = _runtime_data()
    if rt is None:
        print("UniPet bridge not running. Start with: unipet launch")
        return 1

    host = args.host or rt.get("host", DEFAULT_BRIDGE_HOST)
    port = args.port or rt.get("port", DEFAULT_BRIDGE_PORT)

    payload = {
        "protocol": PROTOCOL_VERSION,
        "source_id": args.source or "local-unipet",
        "label": args.label or args.source or "UniPet",
        "state": args.state,
        "message": args.message,
        "action": "update",
    }
    if args.ttl_ms:
        payload["ttl_ms"] = args.ttl_ms
    try:
        result = _send_event(host, port, payload)
        print(f"Emitted: {args.state} - {args.message}")
        print(f"  active state -> {result.get('active_state', '?')}")
    except Exception as e:
        print(f"Failed: {e}", file=sys.stderr)
        return 1
    return 0


def cmd_clear(args: Any) -> int:
    rt = _runtime_data()
    if rt is None:
        print("UniPet bridge not running. Start with: unipet launch")
        return 1

    host = args.host or rt.get("host", DEFAULT_BRIDGE_HOST)
    port = args.port or rt.get("port", DEFAULT_BRIDGE_PORT)
    payload = {
        "protocol": PROTOCOL_VERSION,
        "source_id": "local-unipet",
        "state": "idle",
        "message": "cleared",
        "action": "clear",
    }
    try:
        result = _send_event(host, port, payload)
        print(f"Cleared. active state -> {result.get('active_state', '?')}")
    except Exception as e:
        print(f"Failed: {e}", file=sys.stderr)
        return 1
    return 0


# ---------------------------------------------------------------------------
# Overlay launcher
# ---------------------------------------------------------------------------
def _find_overlay_dir() -> Optional[Path]:
    this_dir = Path(__file__).resolve().parent.parent.parent / "overlay"
    if (this_dir / "package.json").exists():
        return this_dir
    try:
        import importlib.resources
        overlay = importlib.resources.files("unipet").joinpath("overlay")
        if overlay.is_dir():
            return Path(str(overlay))
    except Exception:
        pass
    return None


def _maybe_launch_overlay(
    host: str = DEFAULT_BRIDGE_HOST,
    port: int = DEFAULT_BRIDGE_PORT,
    ws_port: int = DEFAULT_WS_PORT,
) -> Optional[int]:
    overlay_dir = _find_overlay_dir()
    if not overlay_dir:
        print("  (overlay not found)")
        return None

    node = _find_executable("node")
    if not node:
        print("  (Node.js not found, skipping overlay)")
        return None

    env = os.environ.copy()
    env["UNIPET_HOST"] = host
    env["UNIPET_PORT"] = str(port)
    env["UNIPET_WS_PORT"] = str(ws_port)
    env["UNIPET_WS_URL"] = f"ws://{host}:{ws_port}/ws"

    runtime_dir = get_unipet_home() / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    log_path = runtime_dir / "overlay.log"
    log_file = log_path.open("a", encoding="utf-8")
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0

    electron_candidates = [
        overlay_dir / "node_modules" / ".bin" / "electron.cmd",
        overlay_dir / "node_modules" / ".bin" / "electron.exe",
        overlay_dir / "node_modules" / ".bin" / "electron",
    ]
    electron = next((p for p in electron_candidates if p.exists()), None)
    if electron:
        try:
            proc = subprocess.Popen(
                [str(electron), "."],
                cwd=str(overlay_dir),
                stdout=log_file,
                stderr=log_file,
                env=env,
                creationflags=creationflags,
            )
            log_file.close()
            print("  Overlay launched")
            return proc.pid
        except Exception as e:
            print(f"  (overlay failed: {e})")
    else:
        npx = _find_executable("npx")
        if npx:
            try:
                proc = subprocess.Popen(
                    ["npx", "electron", "."],
                    cwd=str(overlay_dir),
                    stdout=log_file,
                    stderr=log_file,
                    env=env,
                    creationflags=creationflags,
                )
                log_file.close()
                print("  Overlay launched via npx")
                return proc.pid
            except Exception as e:
                print(f"  (overlay failed: {e})")
        else:
            print("  (Electron not found)")
    log_file.close()
    return None


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="unipet",
        description="UniPet — Universal Desktop Pet for AI Coding Agents",
    )
    sub = parser.add_subparsers(dest="command")

    launch_p = sub.add_parser("launch", help="Start bridge + overlay in background")
    launch_p.add_argument("--host", default=DEFAULT_BRIDGE_HOST)
    launch_p.add_argument("--port", type=int, default=DEFAULT_BRIDGE_PORT)
    launch_p.add_argument("--ws-port", type=int, default=DEFAULT_WS_PORT)
    launch_p.add_argument("--no-overlay", action="store_true", help="Start only the local bridge")

    sub.add_parser("status", help="Show bridge/overlay status")
    sub.add_parser("stop", help="Stop bridge + overlay")

    emit_p = sub.add_parser("emit", help="Send a state event to the bridge")
    emit_p.add_argument("state", choices=["idle", "running", "waiting", "failed", "review"])
    emit_p.add_argument("message", help="Display message")
    emit_p.add_argument("--source", default=None, help="Source ID")
    emit_p.add_argument("--label", default=None, help="Human-readable source label")
    emit_p.add_argument("--ttl-ms", type=int, default=None, help="Auto-expire this event after N milliseconds")
    emit_p.add_argument("--host", default=DEFAULT_BRIDGE_HOST)
    emit_p.add_argument("--port", type=int, default=DEFAULT_BRIDGE_PORT)

    clear_p = sub.add_parser("clear", help="Clear all pet events")
    clear_p.add_argument("--host", default=DEFAULT_BRIDGE_HOST)
    clear_p.add_argument("--port", type=int, default=DEFAULT_BRIDGE_PORT)

    return parser


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------
def main() -> None:
    _configure_stdio()
    if "--status" in sys.argv:
        sys.exit(cmd_status(argparse.Namespace(host=None, port=None, command="status")))
    if "--stop" in sys.argv:
        sys.exit(cmd_stop(argparse.Namespace(host=None, port=None, command="stop")))

    parser = build_parser()
    args = parser.parse_args()

    if args.command == "launch":
        sys.exit(cmd_launch(args))
    elif args.command == "emit":
        sys.exit(cmd_emit(args))
    elif args.command == "clear":
        sys.exit(cmd_clear(args))
    elif args.command == "stop":
        sys.exit(cmd_stop(args))
    else:
        sys.exit(cmd_status(args))


if __name__ == "__main__":
    main()
