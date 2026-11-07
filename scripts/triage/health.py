from __future__ import annotations
import argparse, hashlib, json, os, shlex, subprocess, sys, time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from triage.classifier import *
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
