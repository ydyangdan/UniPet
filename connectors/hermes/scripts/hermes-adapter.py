#!/usr/bin/env python3
"""
Hermes Agent → UniPet adapter.

Two modes:
  1. CLI mode:  hermes-adapter emit <state> <message>
  2. Watch mode: hermes-adapter watch
     Monitors Hermes Agent activity and auto-sends state to UniPet bridge.

Usage:
    hermes-adapter emit running "正在执行任务..."
    hermes-adapter emit idle "就绪"
    hermes-adapter watch          # 后台守护模式，自动检测状态
    hermes-adapter watch --once   # 单次检测
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import textwrap
import time
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

# ── 配置 ──────────────────────────────────────────────────────────────────
BRIDGE_HOST = os.environ.get("UNIPET_HOST", "127.0.0.1")
BRIDGE_PORT = int(os.environ.get("UNIPET_PORT", "8768"))
BRIDGE_URL = f"http://{BRIDGE_HOST}:{BRIDGE_PORT}/api/pet/events"
HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
HERMES_LOG = HERMES_HOME / "logs" / "agent.log"
HERMES_PET_HOME = Path(os.environ.get("UNIPET_HOME", Path.home() / ".unipet"))
WATCHER_LOCK = HERMES_PET_HOME / "runtime" / "adapter_watch.pid"


# ── 工具函数 ──────────────────────────────────────────────────────────────
def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass




def send_event(
    state: str,
    message: str,
    source_id: str = "hermes",
    label: str = "Hermes",
    ttl_ms: Optional[int] = None,
) -> Optional[dict]:
    """发送状态事件到 UniPet bridge."""
    payload_data = {
        "protocol": "unipet.v1",
        "source_id": source_id,
        "label": label,
        "state": state,
        "message": message,
        "action": "update",
    }
    if ttl_ms is not None:
        payload_data["ttl_ms"] = ttl_ms
    payload = json.dumps(payload_data).encode("utf-8")

    try:
        req = urllib.request.Request(
            BRIDGE_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as e:
        print(f"[unipet-adapter] bridge unavailable: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[unipet-adapter] send failed: {e}", file=sys.stderr)
        return None


def hermes_is_running() -> bool:
    """检查 Hermes Agent 是否正在运行."""
    # 方法1: 检查 Hermes 日志在最近30秒内是否有新内容
    if HERMES_LOG.exists():
        try:
            mtime = HERMES_LOG.stat().st_mtime
            if time.time() - mtime < 30:
                return True
        except Exception:
            pass
    # 方法2: 检查 Hermes session 目录是否有活跃 session 文件
    sessions_dir = HERMES_HOME / "sessions"
    if sessions_dir.exists():
        try:
            for f in sessions_dir.iterdir():
                if f.suffix == ".db" or f.suffix == ".json" or f.suffix == ".sqlite":
                    if time.time() - f.stat().st_mtime < 60:
                        return True
        except Exception:
            pass
    return False


def detect_recent_errors(session_id: Optional[str] = None, minutes: float = 5) -> bool:
    """检测最近日志中是否有 ERROR."""
    if not HERMES_LOG.exists():
        return False
    try:
        since = time.time() - minutes * 60  # minutes can be float
        content = HERMES_LOG.read_text(encoding="utf-8", errors="replace")
        for line in content.splitlines():
            if "ERROR" not in line:
                continue
            # 如果指定了 session，只匹配该 session
            if session_id and session_id not in line:
                continue
            return True
    except Exception:
        pass
    return False


def get_current_session_id() -> Optional[str]:
    """从日志中检测当前活动 session ID."""
    if not HERMES_LOG.exists():
        return None
    try:
        content = HERMES_LOG.read_text(encoding="utf-8", errors="replace")
        # 匹配格式: [20260512_105625_4babd3]
        matches = re.findall(r"\[(\d{8}_\d{6}_[a-f0-9]+)\]", content)
        if matches:
            return matches[-1]  # 最新的 session
    except Exception:
        pass
    return None


def detect_session_active(session_id: str) -> bool:
    """检测 session 是否在最近 30 秒内有活动."""
    if not HERMES_LOG.exists():
        return False
    try:
        now = datetime.now()
        content = HERMES_LOG.read_text(encoding="utf-8", errors="replace")
        for line in content.splitlines():
            if session_id not in line:
                continue
            # 尝试提取时间戳
            match = re.match(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", line)
            if match:
                try:
                    ts = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S")
                    if (now - ts).total_seconds() < 60:
                        return True
                except ValueError:
                    pass
    except Exception:
        pass
    return False


# ── 命令实现 ──────────────────────────────────────────────────────────────


def cmd_emit(args: argparse.Namespace) -> int:
    """发送一条状态事件."""
    result = send_event(
        args.state,
        args.message,
        source_id=args.source or "hermes",
        label=args.label or "Hermes",
        ttl_ms=args.ttl_ms,
    )
    if result:
        print(f"Emitted: {args.state} - {args.message}")
        print(f"  active state -> {result.get('active_state', '?')}")
        return 0
    print("Failed to send event. Is the bridge running?", file=sys.stderr)
    return 1


def cmd_watch(args: argparse.Namespace) -> int:
    """
    看门狗模式：持续监测 Hermes Agent 状态，自动发送到 UniPet。

    逻辑：
      1. Hermes 进程运行 → 发送 running
      2. Hermes 进程不运行 → 发送 idle
      3. 日志中有 ERROR → 发送 failed
      4. 检测到新 session → 发送 running
    """
    if not args.once:
        # 写入 PID 文件
        HERMES_PET_HOME.mkdir(parents=True, exist_ok=True)
        WATCHER_LOCK.parent.mkdir(parents=True, exist_ok=True)
        WATCHER_LOCK.write_text(str(os.getpid()))
        print(f"[unipet-adapter] watcher started (pid {os.getpid()})")
        print(f"  monitoring {HERMES_LOG}")
        print(f"  sending to {BRIDGE_URL}")

    last_state = "unknown"
    last_session = get_current_session_id()
    check_interval = args.interval or 3  # seconds

    try:
        while True:
            running = hermes_is_running()
            session_id = get_current_session_id()
            has_errors = detect_recent_errors(session_id)

            # 判断当前状态（优先级: failed > running > idle）
            if running:
                current = "running"
                msg = "正在执行任务"
                # 只有最近的错误（30秒内）才显示 failed
                if has_errors and detect_recent_errors(minutes=0.5, session_id=session_id):
                    current = "failed"
                    msg = "检测到错误"
                elif session_id and session_id != last_session:
                    msg = "开始新任务"
                    last_session = session_id
            else:
                current = "idle"
                msg = "就绪"

            # 状态变化时才发送
            if current != last_state:
                result = send_event(current, msg, ttl_ms=check_interval * 3000)
                if result:
                    print(
                        f"[{datetime.now().strftime('%H:%M:%S')}] "
                        f"{last_state:>8} → {current:>8}  | {msg}"
                    )
                last_state = current

            if args.once:
                break
            time.sleep(check_interval)

    except KeyboardInterrupt:
        print("\n[unipet-adapter] watcher stopped")
        WATCHER_LOCK.unlink(missing_ok=True)

    return 0


# ── CLI ────────────────────────────────────────────────────────────────────


def main() -> None:
    configure_stdio()
    parser = argparse.ArgumentParser(
        prog="hermes-adapter",
        description="Hermes Agent → UniPet state adapter",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command")

    # emit
    emit_p = sub.add_parser("emit", help="Send a state event to UniPet bridge")
    emit_p.add_argument("state", choices=["idle", "running", "waiting", "review", "failed"])
    emit_p.add_argument("message", help="Display message")
    emit_p.add_argument("--source", default="hermes", help="Source ID")
    emit_p.add_argument("--label", default="Hermes", help="Display label")
    emit_p.add_argument("--ttl-ms", type=int, default=None, help="Auto-expire after N milliseconds")

    # watch
    watch_p = sub.add_parser("watch", help="Watch Hermes Agent and auto-send state")
    watch_p.add_argument("--once", action="store_true", help="Single check, then exit")
    watch_p.add_argument("--interval", type=int, default=3, help="Check interval (seconds)")

    args = parser.parse_args()

    if args.command == "emit":
        sys.exit(cmd_emit(args))
    elif args.command == "watch":
        sys.exit(cmd_watch(args))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
