"""Hermes plugin bridge for UniPet.

This plugin is intentionally tiny and best-effort. It runs inside Hermes,
observes lifecycle hooks, and posts Codex Pet semantic states to the local
UniPet bridge without modifying Hermes core.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Optional

SOURCE = os.getenv("UNIPET_HERMES_SOURCE", "hermes")
HOST = os.getenv("UNIPET_HOST", "127.0.0.1")
AUTO_START = os.getenv("UNIPET_HERMES_AUTO_START", "1").lower() not in {
    "0",
    "false",
    "no",
    "off",
}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


PORT = _env_int("UNIPET_PORT", 8768)
EVENT_URL = f"http://{HOST}:{PORT}/api/pet/events"
HEALTH_URL = f"http://{HOST}:{PORT}/health"
HTTP_TIMEOUT = max(0.05, _env_int("UNIPET_HERMES_TIMEOUT_MS", 350) / 1000)
MIN_INTERVAL = max(0.0, _env_int("UNIPET_HERMES_MIN_INTERVAL_MS", 700) / 1000)
ERROR_STATUSES = {"error", "failed", "failure", "exception"}
ERROR_TEXT_PREFIXES = ("error:", "exception:", "traceback ")
ERROR_TEXT_MARKERS = (
    "api call failed",
    "api failed",
    "connection error",
    "network error",
    "rate limited",
    "max retries",
    "failed after",
    "invalid api response",
)
ACTIVE_TTL = 120000
REVIEW_TTL = 12000
FAILURE_TTL = 20000
WAITING_TTL = 120000
APPROVAL_TTL = 120000

_last_signature: Optional[tuple[str, str, str, str]] = None
_last_sent_at = 0.0
_start_attempted_at = 0.0
_lock = threading.Lock()


def _clip(value: Any, fallback: str, limit: int = 160) -> str:
    text = str(value or fallback).strip()
    return (text or fallback)[:limit]


def _short_tool_name(tool_name: str) -> str:
    return _clip(tool_name, "tool", 48)


def _event(
    state: str,
    message: str,
    *,
    action: str = "update",
    ttl: Optional[int] = None,
    source: str = SOURCE,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "source": source,
        "state": state,
        "message": _clip(message, state),
        "action": action,
    }
    if ttl is not None:
        payload["ttl"] = ttl
    return payload


def _is_error_text(text: str) -> bool:
    lower = text.strip().lower()
    if not lower:
        return False
    return lower.startswith(ERROR_TEXT_PREFIXES) or any(marker in lower for marker in ERROR_TEXT_MARKERS)


def _error_message(value: Any, fallback: str = "Hermes API call failed") -> str:
    if value is None:
        return fallback
    if isinstance(value, BaseException):
        return _clip(str(value), fallback)
    if isinstance(value, dict):
        for key in ("error", "exception", "message", "detail", "reason", "status"):
            if value.get(key):
                return _clip(value.get(key), fallback)
        return fallback
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return fallback
        try:
            parsed = json.loads(text)
        except Exception:
            return _clip(text, fallback)
        return _error_message(parsed, fallback)
    return _clip(value, fallback)


def _is_error_result(result: Any) -> bool:
    if result is None:
        return False
    if isinstance(result, BaseException):
        return True
    if isinstance(result, dict):
        status = str(result.get("status") or result.get("state") or "").strip().lower()
        return bool(
            result.get("error")
            or result.get("exception")
            or result.get("ok") is False
            or result.get("success") is False
            or status in ERROR_STATUSES
        )
    if not isinstance(result, str):
        return False

    text = result.strip()
    if not text:
        return False
    try:
        parsed = json.loads(text)
    except Exception:
        return _is_error_text(text)
    return _is_error_result(parsed)


def _post(payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        EVENT_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        },
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as res:
        res.read(256)


def _health() -> bool:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=HTTP_TIMEOUT) as res:
            return 200 <= res.status < 300
    except Exception:
        return False


def _start_unipet_once() -> None:
    global _start_attempted_at
    if not AUTO_START:
        return
    now = time.monotonic()
    with _lock:
        if now - _start_attempted_at < 30:
            return
        _start_attempted_at = now

    exe = shutil.which("unipet")
    if not exe:
        return

    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        subprocess.Popen(
            [exe, "start"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=os.name != "nt",
            creationflags=creationflags,
        )
    except Exception:
        pass


def _send(payload: dict[str, Any]) -> None:
    def worker() -> None:
        try:
            _post(payload)
            return
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        except Exception:
            return

        _start_unipet_once()
        for _ in range(10):
            if _health():
                break
            time.sleep(0.2)
        else:
            return

        try:
            _post(payload)
        except Exception:
            pass

    thread = threading.Thread(target=worker, name="unipet-hermes-hook", daemon=True)
    thread.start()


def _emit(payload: dict[str, Any]) -> None:
    global _last_signature, _last_sent_at
    signature = (
        payload.get("source", ""),
        payload.get("action", "update"),
        payload.get("state", ""),
        payload.get("message", ""),
    )
    now = time.monotonic()
    with _lock:
        if signature == _last_signature and now - _last_sent_at < MIN_INTERVAL:
            return
        _last_signature = signature
        _last_sent_at = now
    _send(payload)


def _on_session_start(session_id: str = "", **_: Any) -> None:
    _emit(_event("running", "Hermes session started", ttl=ACTIVE_TTL))


def _on_pre_llm_call(**_: Any) -> None:
    _emit(_event("running", "Hermes is thinking", ttl=ACTIVE_TTL))


def _on_pre_api_request(**_: Any) -> None:
    _emit(_event("running", "Hermes is thinking", ttl=ACTIVE_TTL))


def _on_pre_tool_call(tool_name: str = "", **_: Any) -> None:
    _emit(_event("running", f"Running {_short_tool_name(tool_name)}", ttl=ACTIVE_TTL))


def _on_post_tool_call(tool_name: str = "", result: Any = None, **_: Any) -> None:
    if _is_error_result(result):
        _emit(_event("failed", f"{_short_tool_name(tool_name)} failed", ttl=FAILURE_TTL))


def _on_pre_approval_request(**_: Any) -> None:
    _emit(_event("waiting", "Waiting for approval", ttl=APPROVAL_TTL))


def _on_post_approval_response(choice: str = "", **_: Any) -> None:
    normalized = str(choice or "").strip().lower()
    if normalized in {"deny", "timeout"}:
        _emit(_event("failed", f"Approval {normalized or 'failed'}", ttl=FAILURE_TTL))
    else:
        _emit(_event("running", "Approval received", ttl=ACTIVE_TTL))


def _on_post_llm_call(
    assistant_response: Any = None,
    response: Any = None,
    result: Any = None,
    error: Any = None,
    exception: Any = None,
    **kwargs: Any,
) -> None:
    candidates = (
        error,
        exception,
        result,
        response,
        assistant_response,
        kwargs.get("message"),
        kwargs.get("output"),
    )
    for candidate in candidates:
        if _is_error_result(candidate):
            _emit(_event("failed", _error_message(candidate), ttl=FAILURE_TTL))
            return
    _emit(_event("review", "Done, please review", ttl=REVIEW_TTL))


def _on_session_end(completed: bool = True, interrupted: bool = False, **_: Any) -> None:
    if interrupted:
        _emit(_event("waiting", "Hermes was interrupted", ttl=WAITING_TTL))
    elif not completed:
        _emit(_event("failed", "Hermes task did not complete", ttl=FAILURE_TTL))


def _remove_source(**_: Any) -> None:
    _emit(_event("idle", "Hermes session closed", action="remove"))


def register(ctx) -> None:
    ctx.register_hook("on_session_start", _on_session_start)
    ctx.register_hook("pre_llm_call", _on_pre_llm_call)
    ctx.register_hook("pre_api_request", _on_pre_api_request)
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    ctx.register_hook("pre_approval_request", _on_pre_approval_request)
    ctx.register_hook("post_approval_response", _on_post_approval_response)
    ctx.register_hook("post_llm_call", _on_post_llm_call)
    ctx.register_hook("on_session_end", _on_session_end)
    ctx.register_hook("on_session_finalize", _remove_source)
    ctx.register_hook("on_session_reset", _remove_source)
