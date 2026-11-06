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


def run_triage(args, runner: Optional[KanbanRunner] = None) -> int:
    if runner is None:
        runner = KanbanRunner()

    lock_path = Path(args.lock_path) if args.lock_path else (hermes_home() / "kanban" / "triage.lock")
    if not acquire_lock(lock_path, timeout=60):
        print("triage already running", file=sys.stderr)
        return 3

    try:
        state_path = Path(args.state_path) if args.state_path else Path(env("TRIAGE_STATE_PATH", str(hermes_home() / "kanban" / "triage_state.json")))
        log_path = Path(args.log_path) if args.log_path else Path(env("TRIAGE_LOG_PATH", str(hermes_home() / "kanban" / "triage.log")))
        esc_age = int(env("TRIAGE_ESCALATION_AGE_SECONDS", str(TRIAGE_ESCALATION_AGE_DEFAULT)))
        max_tasks = int(env("TRIAGE_MAX_TASKS", str(args.max_tasks)))
        dry_run = args.dry_run or (env("TRIAGE_DRY_RUN", "false").lower() == "true")

        state = load_state(state_path)
        # cleanup stale fingerprints
        processed = state.get("processed") or {}
        stale = []
        for fp, info in list(processed.items()):
            tidp = info.get("task_id") if isinstance(info, dict) else None
            if tidp:
                try:
                    sr = runner.show(tidp)
                    data = sr.data if sr.ok else None
                    if isinstance(data, dict):
                        if "task" in data and isinstance(data["task"], dict):
                            data = data["task"]
                        if data.get("status") != "blocked":
                            stale.append(fp)
                except Exception:
                    pass
        for fp in stale:
            processed.pop(fp, None)
        state["processed"] = processed
        run_id = f"triage-{time.strftime('%Y%m%dT%H%M%S')}"

        lr = runner.list_blocked(max_tasks)
        if not lr.ok:
            print(json.dumps({"error": lr.error}), file=sys.stderr)
            return 1
        data = lr.data
        tasks_summary = []
        if isinstance(data, dict):
            tasks_summary = data.get("tasks") or data.get("items") or []
        elif isinstance(data, list):
            tasks_summary = data

        # sort by created_at then id
        def key(t):
            return (t.get("created_at") or 0, t.get("id") or "")
        tasks_summary = sorted(tasks_summary, key=key)

        unblocked: List[Dict[str, Any]] = []
        escalations: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []
        scanned = 0

        for summ in tasks_summary:
            tid = summ.get("id")
            if not tid:
                continue
            scanned += 1
            try:
                sr = runner.show(tid)
                if not sr.ok:
                    errors.append({"task_id": tid, "operation": "show", "error": sr.error})
                    continue
                task = sr.data
                if not isinstance(task, dict):
                    task = {"id": tid}
                # unwrap if needed
                outer = task
                if "task" in task and isinstance(task["task"], dict):
                    inner = task["task"]
                    for key in ("events", "comments", "parents", "children"):
                        if key not in inner and key in task:
                            inner[key] = task.get(key)
                    task = inner
                # normalize real-CLI shape
                if task.get("block_kind") is None:
                    events = task.get("events") or []
                    latest = None
                    for ev in reversed(events):
                        if ev.get("kind") in ("blocked", "block_loop_detected"):
                            latest = ev
                            break
                    if latest:
                        payload = latest.get("payload") or {}
                        bk = payload.get("kind")
                        if bk:
                            task["block_kind"] = bk
                        task["block_recurrences"] = payload.get("recurrences", task.get("block_recurrences", 0))
                task.setdefault("block_recurrences", 0)
                task.setdefault("consecutive_failures", 0)
                task.setdefault("current_run_id", None)

                if task.get("status") != "blocked":
                    continue

                blocker = classify(task)
                fp = fingerprint(task, blocker)
                if fp in (state.get("processed") or {}):
                    continue
                # secondary idempotency: comment fingerprint
                skip = False
                for c in (task.get("comments") or []):
                    if f"<!-- triage-fingerprint: {fp} -->" in (c.get("body") or ""):
                        skip = True
                        break
                if skip:
                    continue

                checks: Dict[str, Any] = {}
                resolvable, reason, check_names = is_resolvable(task, blocker, checks, dry_run, runner=runner)

                # build health_checks dict for this task's needed checks
                hc = {n: checks.get(n) for n in check_names if checks.get(n) is not None}
                if not hc:
                    hc = checks

                now_ts = int(time.time())
                created_at = task.get("created_at")
                age = None
                if created_at:
                    # created_at may be epoch seconds or ms; handle both
                    ca = created_at
                    if ca > 10**12:
                        ca = ca / 1000
                    age = now_ts - int(ca)

                if resolvable and not dry_run:
                    ur = runner.unblock(tid, f"triage: {reason}")
                    if ur.ok:
                        result_status = "ready"
                        if isinstance(ur.data, dict):
                            result_status = ur.data.get("status") or ur.data.get("new_status") or result_status
                        comment_body = (
                            "triage: auto-unblocked\n"
                            f"kind: {blocker['block_kind']}\n"
                            f"reason: {reason}\n"
                            f"health_checks: {json.dumps(hc)}\n"
                            f"run: {run_id}\n"
                        )
                        cr = runner.comment(tid, comment_body)
                        if not cr.ok:
                            errors.append({"task_id": tid, "operation": "comment", "error": cr.error})
                        unblocked.append({
                            "task_id": tid,
                            "from_status": "blocked",
                            "to_status": result_status,
                            "block_kind": blocker["block_kind"],
                            "reason": reason,
                        })
                        state.setdefault("processed", {})[fp] = {"task_id": tid, "action": "unblocked", "at": now_ts}
                        # log
                        _log(log_path, run_id, tid, "blocked", blocker["block_kind"], "unblock", result_status, reason)
                    else:
                        errors.append({"task_id": tid, "operation": "kanban_unblock", "error": ur.error})
                        escalations.append(_escalation(task, blocker, hc, age, "unblock_failed", esc_age, ur.error, runner=runner))
                        state.setdefault("processed", {})[fp] = {"task_id": tid, "action": "escalated", "at": now_ts}
                else:
                    recommended = _recommended_action(blocker["block_kind"], reason)
                    comment_body = (
                        "triage: escalation\n"
                        f"recommended_action: {recommended}\n"
                        f"reason: {blocker['blocker_reason']}\n"
                        f"run: {run_id}\n"
                        f"<!-- triage-fingerprint: {fp} -->\n"
                    )
                    if not dry_run:
                        cr = runner.comment(tid, comment_body)
                        if not cr.ok:
                            errors.append({"task_id": tid, "operation": "comment", "error": cr.error})
                    escalations.append(_escalation(task, blocker, hc, age, recommended, esc_age, None, runner=runner))
                    state.setdefault("processed", {})[fp] = {"task_id": tid, "action": "escalated", "at": now_ts}
                    _log(log_path, run_id, tid, "blocked", blocker["block_kind"], "escalate", "blocked", reason)

            except Exception as e:  # noqa: BLE001
                errors.append({"task_id": tid, "operation": "triage", "error": str(e)})

        state["last_run_id"] = run_id
        state["last_run_at"] = int(time.time())
        save_state(state_path, state)

        # write escalation file
        payload = {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "board": board(),
            "trigger": args.trigger,
            "run_id": run_id,
            "summary": {
                "scanned": scanned,
                "unblocked": len(unblocked),
                "escalated": len(escalations),
                "errors": len(errors),
            },
            "unblocked": unblocked,
            "escalations": escalations,
            "errors": errors,
        }
        out_dir = Path(args.output_dir) if args.output_dir else Path.cwd()
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = time.strftime("%Y%m%dT%H%M%S")
        out_file = out_dir / f"triage-escalations-{ts}.json"
        out_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        print(json.dumps(payload, ensure_ascii=False, indent=2))
        if errors:
            return 2
        return 0
    finally:
        release_lock(lock_path)


def _recommended_action(bk: str, reason: str) -> str:
    mapping = {
        "needs_input": "provide_human_input",
        "capability": "restore_capability",
        "transient": "wait_for_health_recovery",
        "dependency": "complete_parent_tasks",
        "unknown": "investigate",
    }
    return mapping.get(bk, "investigate")


def _escalation(task, blocker, hc, age, recommended, esc_age, error, runner=None):
    parents = task.get("parents") or []
    parent_list = []
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
        parent_list.append({"id": pid, "status": st})
    eff_limit = task.get("max_retries")
    if eff_limit is None:
        eff_limit = 2
    e = {
        "task_id": task.get("id"),
        "title": task.get("title"),
        "assignee": task.get("assignee"),
        "status": task.get("status"),
        "block_kind": blocker["block_kind"],
        "block_recurrences": task.get("block_recurrences", 0),
        "consecutive_failures": task.get("consecutive_failures", 0),
        "effective_failure_limit": eff_limit,
        "last_failure_error": task.get("last_failure_error"),
        "blocker_reason": blocker["blocker_reason"],
        "blocker_source": blocker["blocker_source"],
        "recommended_action": recommended,
        "parents": parent_list,
        "children": task.get("children") or [],
        "age_seconds": age,
        "health_checks": hc,
        "suggested_next_step": _suggested(blocker["block_kind"], blocker["blocker_reason"]),
    }
    if error:
        e["error"] = error
    if age is not None and age > esc_age:
        e["escalation_age_exceeded"] = True
    return e


def _suggested(bk, reason):
    if bk == "needs_input":
        return "Ответить на вопрос в комментарии задачи."
    if bk == "capability":
        return "Восстановить доступ/credentials и перезапустить triage."
    if bk == "transient":
        return "Проверить Docker/Postgres и перезапустить triage."
    if bk == "dependency":
        return "Завершить родительские задачи."
    return "Расследовать причину блокировки вручную."


def _log(log_path, run_id, task_id, before, bk, decision, after, reason):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "run_id": run_id,
        "task_id": task_id,
        "before_status": before,
        "block_kind": bk,
        "decision": decision,
        "after_status": after,
        "reason": reason,
    }
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Blocked-task triage")
    parser.add_argument("--trigger", default="manual", choices=["cron", "post-dispatch", "manual"])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--board", default=None)
    parser.add_argument("--max-tasks", type=int, default=200)
    parser.add_argument("--state-path", default=None)
    parser.add_argument("--log-path", default=None)
    parser.add_argument("--lock-path", default=None)
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args()
    if args.board:
        os.environ["HERMES_KANBAN_BOARD"] = args.board
    # guard: must not run in supervised child context
    if os.environ.get("HERMES_SUPERVISED_CHILD") == "1" or os.environ.get("HERMES_DELEGATED_CHILD_CONTEXT"):
        print("triage must run in operator context (HERMES_SUPERVISED_CHILD/DELEGATED_CHILD_CONTEXT set)", file=sys.stderr)
        return 1
    return run_triage(args)


if __name__ == "__main__":
    sys.exit(main())
