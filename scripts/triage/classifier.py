#!/usr/bin/env python3
"""Blocked-task triage routine for Hermes Kanban.

Operator/cron entrypoint. Reads blocked tasks via `hermes kanban ...` CLI,
classifies blockers, unblocks only resolvable ones, escalates the rest.

Run from a normal operator shell (HERMES_SUPERVISED_CHILD must NOT be set).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

BLOCK_RECURRENCE_LIMIT = 2
TRIAGE_ESCALATION_AGE_DEFAULT = 86400

TRANSIENT_PATTERNS = ("timeout", "connection refused", "econnreset", "deadlock", "503", "spawn failed", "environment")
CAPABILITY_PATTERNS = ("permission denied", "not found", "unauthorized", "missing executable", "credential")
RESOLUTION_MARKERS = ("triage-resolution: unblock", "resolution: approved", "unblock approved")


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def hermes_home() -> Path:
    return Path(env("HERMES_HOME", str(Path.home() / ".hermes")))


def kanban_db() -> str:
    return env("HERMES_KANBAN_DB", str(hermes_home() / "kanban.db"))


def board() -> str:
    return env("HERMES_KANBAN_BOARD", "default")


@dataclass
class RunnerResult:
    ok: bool
    data: Any = None
    error: Optional[str] = None


class KanbanRunner:
    """Thin wrapper around `hermes kanban` CLI. Injectable for tests."""

    def __init__(self, cli: str = "hermes", env: Optional[Dict[str, str]] = None):
        self.cli = cli
        self.env = env or dict(os.environ)

    def _run(self, args: List[str]) -> RunnerResult:
        last: Optional[RunnerResult] = None
        for attempt in range(4):
            try:
                proc = subprocess.run(
                    [self.cli, "kanban", *args],
                    capture_output=True,
                    text=True,
                    env=self.env,
                    timeout=60,
                )
            except Exception as e:  # noqa: BLE001
                last = RunnerResult(False, None, str(e))
                if attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                return last
            out = (proc.stdout or "").strip()
            if proc.returncode != 0:
                err = (proc.stderr or out or f"exit {proc.returncode}").strip()
                last = RunnerResult(False, None, err)
                if "locked" in err.lower() and attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                return last
            if not out:
                return RunnerResult(True, None, None)
            try:
                return RunnerResult(True, json.loads(out), None)
            except json.JSONDecodeError:
                return RunnerResult(True, out, None)
        return last or RunnerResult(False, None, "retry exhausted")

    def list_blocked(self, limit: int) -> RunnerResult:
        return self._run(["list", "--status", "blocked", "--json"])

    def show(self, task_id: str) -> RunnerResult:
        return self._run(["show", task_id, "--json"])

    def unblock(self, task_id: str, reason: str) -> RunnerResult:
        return self._run(["unblock", task_id, "--reason", reason])

    def comment(self, task_id: str, body: str) -> RunnerResult:
        return self._run(["comment", task_id, body])


def health_check(name: str, timeout: int = 10) -> Dict[str, Any]:
    start = time.time()
    try:
        if name == "docker":
            proc = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=timeout)
            ok = proc.returncode == 0
            details = "ok" if ok else (proc.stderr or "").strip()[:200]
        elif name == "postgres":
            host = env("POSTGRES_HOST", "localhost")
            port = env("POSTGRES_PORT", "5432")
            import socket
            s = socket.create_connection((host, int(port)), timeout=timeout)
            s.close()
            ok = True
            details = f"tcp {host}:{port} ok"
        elif name == "kanban_db":
            import sqlite3
            conn = sqlite3.connect(kanban_db())
            cur = conn.execute("PRAGMA integrity_check")
            row = cur.fetchone()
            conn.close()
            ok = row is not None and row[0] == "ok"
            details = row[0] if row else "no result"
        elif name == "env":
            missing = [v for v in ("HERMES_KANBAN_DB", "HERMES_KANBAN_BOARD") if not env(v)]
            ok = not missing
            details = "missing: " + ",".join(missing) if missing else "ok"
        else:
            ok = False
            details = f"unknown check {name}"
    except Exception as e:  # noqa: BLE001
        ok = False
        details = str(e)[:200]
    return {"passed": ok, "details": details, "duration_ms": int((time.time() - start) * 1000)}


def needed_checks(bk: str, reason: str = "") -> List[str]:
    reason_l = (reason or "").lower()
    docker = "docker" in reason_l
    postgres = any(k in reason_l for k in ("postgres", "database", "db", "sql"))
    if bk == "transient":
        out = ["kanban_db"]
        if docker:
            out.append("docker")
        if postgres:
            out.append("postgres")
        return out
    if bk == "capability":
        out = ["env"]
        if docker:
            out.append("docker")
        if postgres:
            out.append("postgres")
        out.append("kanban_db")
        return out
    if bk == "dependency":
        return ["kanban_db"]
    if bk == "unknown":
        return ["kanban_db"]
    if bk == "needs_input":
        return []
    return ["kanban_db"]

NEEDED_CHECKS = None  # kept for compat; use needed_checks()



def blocker_source(task: Dict[str, Any]) -> tuple[str, str]:
    """Return (reason, source)."""
    events = task.get("events") or []
    for ev in reversed(events):
        if ev.get("kind") in ("blocked", "block_loop_detected"):
            payload = ev.get("payload") or {}
            reason = payload.get("reason")
            if reason:
                return reason, "latest_blocked_event"
    if task.get("last_failure_error"):
        return task["last_failure_error"], "last_failure_error"
    body = task.get("body") or ""
    for line in body.splitlines():
        if "Blocked:" in line or "Причина:" in line:
            return line.strip(), "body"
    return "unknown (no blocker reason recorded)", "none"


def classify(task: Dict[str, Any]) -> Dict[str, Any]:
    block_kind = task.get("block_kind")
    last_err = (task.get("last_failure_error") or "").lower()
    events = task.get("events") or []
    gave_up_sticky = False
    for ev in reversed(events):
        if ev.get("kind") == "gave_up":
            if (ev.get("payload") or {}).get("sticky"):
                gave_up_sticky = True
            break

    if block_kind is None:
        events = task.get("events") or []
        for ev in reversed(events):
            if ev.get("kind") in ("blocked", "block_loop_detected"):
                payload = ev.get("payload") or {}
                bk = payload.get("kind")
                if bk:
                    block_kind = bk
                if task.get("block_recurrences") is None:
                    task["block_recurrences"] = payload.get("recurrences", 0)
                break
    if block_kind is None:
        if gave_up_sticky:
            block_kind = "needs_input"
        elif any(p in last_err for p in TRANSIENT_PATTERNS):
            block_kind = "transient"
        elif any(p in last_err for p in CAPABILITY_PATTERNS):
            block_kind = "capability"
        else:
            block_kind = "unknown"
        classified = True
    else:
        classified = False

    reason, source = blocker_source(task)
    return {
        "block_kind": block_kind,
        "classified_from_null": classified,
        "blocker_reason": reason,
        "blocker_source": source,
    }


def parents_done(task: Dict[str, Any], runner=None) -> bool:
    parents = task.get("parents") or []
    for p in parents:
        if isinstance(p, dict):
            pid = p.get("id") or p.get("task_id")
            st = p.get("status")
        else:
            pid = p
            st = None
        if st is None and runner is not None and pid:
            try:
                sr = runner.show(str(pid))
                data = sr.data if sr.ok else None
                if isinstance(data, dict):
                    if "task" in data and isinstance(data["task"], dict):
                        data = data["task"]
                    st = data.get("status")
            except Exception:
                st = None
        if st not in ("done", "archived"):
            return False
    return True


def human_resolution_found(task: Dict[str, Any]) -> bool:
    events = task.get("events") or []
    last_blocked_ts = 0
    has_blocked = False
    for ev in events:
        if ev.get("kind") in ("blocked", "block_loop_detected"):
            has_blocked = True
            last_blocked_ts = max(last_blocked_ts, ev.get("created_at") or 0)
    comments = task.get("comments") or []
    if has_blocked:
        for c in comments:
            if (c.get("created_at") or 0) >= last_blocked_ts and last_blocked_ts > 0:
                body = (c.get("body") or "").lower()
                if any(m in body for m in RESOLUTION_MARKERS):
                    return True
    body = (task.get("body") or "")
    if "Resolution:" in body:
        after = body.split("Resolution:", 1)[1].strip()
        if after:
            return True
    return False


def fingerprint(task: Dict[str, Any], blocker: Dict[str, Any]) -> str:
    events = task.get("events") or []
    latest_blocked_id = ""
    for ev in reversed(events):
        if ev.get("kind") in ("blocked", "block_loop_detected"):
            latest_blocked_id = str(ev.get("id") or ev.get("created_at") or "")
            break
    raw = "|".join([
        task.get("id", ""),
        blocker["block_kind"],
        str(task.get("block_recurrences", 0)),
        task.get("last_failure_error") or "",
        latest_blocked_id,
    ])
    return hashlib.sha256(raw.encode()).hexdigest()


def is_resolvable(task: Dict[str, Any], blocker: Dict[str, Any], checks: Dict[str, Any], dry_run: bool, runner=None) -> tuple[bool, str, List[str]]:
    if dry_run:
        return False, "dry run", []
    status = task.get("status")
    if status != "blocked":
        return False, "not blocked", []
    if task.get("current_run_id") is not None:
        return False, "current_run_id not null", []
    recurrences = task.get("block_recurrences", 0) or 0
    if recurrences >= BLOCK_RECURRENCE_LIMIT:
        return False, "block_recurrences >= limit", []
    bk = blocker["block_kind"]
    reason = blocker.get("blocker_reason") or blocker.get("reason") or ""
    health_needed = needed_checks(bk, reason)
    health_results = {n: health_check(n) for n in health_needed}
    checks.update(health_results)
    all_pass = all(v["passed"] for v in health_results.values()) if health_results else True

    eff_limit = task.get("max_retries")
    if eff_limit is None:
        eff_limit = 2
    cf = task.get("consecutive_failures", 0) or 0
    failure_ok = cf < eff_limit or (bk in ("transient", "capability") and all_pass)

    if bk == "transient":
        if not all_pass:
            return False, "transient health check failed", list(health_results)
        if not failure_ok:
            return False, "consecutive failures exceeded", list(health_results)
        return True, "transient health check passed", list(health_results)
    if bk == "capability":
        if not all_pass:
            return False, "capability check failed", list(health_results)
        if not failure_ok:
            return False, "consecutive failures exceeded", list(health_results)
        return True, "capability check passed", list(health_results)
    if bk == "needs_input":
        if human_resolution_found(task):
            return True, "human resolution marker found", list(health_results)
        return False, "no human resolution marker", list(health_results)
    if bk == "dependency":
        if parents_done(task, runner=runner):
            return True, "all parents done/archived", list(health_results)
        return False, "parents not done", list(health_results)
    return False, "unknown blocker", list(health_results)


def load_state(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"last_run_id": None, "last_run_at": None, "processed": {}}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"last_run_id": None, "last_run_at": None, "processed": {}}


def save_state(path: Path, state: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def acquire_lock(path: Path, timeout: int = 60) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            time.sleep(1)
    return False


def release_lock(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


