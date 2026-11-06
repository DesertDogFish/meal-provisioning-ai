import sys, os, unittest, tempfile, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kanban_blocked_triage as T

class FakeRunner:
    def __init__(self, blocked, shows=None, unblock_ok=True, comment_ok=True, list_ok=True, show_ok=True):
        self.blocked = blocked
        self.shows = shows or {}
        self.unblock_ok = unblock_ok
        self.comment_ok = comment_ok
        self.list_ok = list_ok
        self.show_ok = show_ok
        self.unblock_calls = []
        self.comment_calls = []
    def list_blocked(self, limit):
        if not self.list_ok:
            return T.RunnerResult(False, None, "list failed")
        return T.RunnerResult(True, list(self.blocked), None)
    def show(self, tid):
        if not self.show_ok:
            return T.RunnerResult(False, None, "show failed")
        d = self.shows.get(tid)
        if d is None:
            return T.RunnerResult(False, None, "not found")
        return T.RunnerResult(True, d, None)
    def unblock(self, tid, reason):
        self.unblock_calls.append((tid, reason))
        if not self.unblock_ok:
            return T.RunnerResult(False, None, "unblock failed")
        return T.RunnerResult(True, {"status": "ready"}, None)
    def comment(self, tid, body):
        self.comment_calls.append((tid, body))
        if not self.comment_ok:
            return T.RunnerResult(False, None, "comment failed")
        return T.RunnerResult(True, None, None)

def make_args(tmp, dry_run=False):
    class A:
        pass
    a = A()
    a.trigger = "manual"
    a.dry_run = dry_run
    a.board = None
    a.max_tasks = 200
    a.state_path = os.path.join(tmp, "state.json")
    a.log_path = os.path.join(tmp, "triage.log")
    a.lock_path = os.path.join(tmp, "triage.lock")
    a.output_dir = tmp
    return a

class TestTriage(unittest.TestCase):
    def test_empty(self):
        r = FakeRunner([])
        args = make_args(tempfile.mkdtemp())
        rc = T.run_triage(args, runner=r)
        self.assertEqual(rc, 0)

    def test_tool_failure_list(self):
        r = FakeRunner([], list_ok=False)
        args = make_args(tempfile.mkdtemp())
        rc = T.run_triage(args, runner=r)
        self.assertEqual(rc, 1)

    def test_unresolvable(self):
        task = {"id":"t1","status":"blocked","block_kind":"needs_input","created_at":1,"block_recurrences":0,"consecutive_failures":0,"current_run_id":None,"events":[{"kind":"blocked","created_at":1,"payload":{"kind":"needs_input","reason":"needs input"}}]}
        r = FakeRunner([{"id":"t1"}], shows={"t1": task})
        args = make_args(tempfile.mkdtemp())
        rc = T.run_triage(args, runner=r)
        self.assertEqual(rc, 0)
        # no unblock
        self.assertEqual(r.unblock_calls, [])
        # escalation recorded
        self.assertEqual(len(r.comment_calls), 1)
        self.assertIn("triage: escalation", r.comment_calls[0][1])

    def test_resolvable_dependency(self):
        task = {"id":"t2","status":"blocked","block_kind":"dependency","parents":["p1"],"created_at":1,"block_recurrences":0,"consecutive_failures":0,"current_run_id":None,"events":[{"kind":"blocked","created_at":1,"payload":{"kind":"dependency","reason":"dep"}}]}
        parent = {"id":"p1","status":"done"}
        r = FakeRunner([{"id":"t2"}], shows={"t2": task, "p1": {"task": parent}})
        args = make_args(tempfile.mkdtemp())
        rc = T.run_triage(args, runner=r)
        self.assertEqual(rc, 0)
        self.assertEqual(len(r.unblock_calls), 1)

    def test_mixed(self):
        t1 = {"id":"a","status":"blocked","block_kind":"needs_input","created_at":1,"block_recurrences":0,"consecutive_failures":0,"current_run_id":None,"events":[{"kind":"blocked","created_at":1,"payload":{"kind":"needs_input","reason":"x"}}]}
        t2 = {"id":"b","status":"blocked","block_kind":"dependency","parents":["p1"],"created_at":2,"block_recurrences":0,"consecutive_failures":0,"current_run_id":None,"events":[{"kind":"blocked","created_at":1,"payload":{"kind":"dependency","reason":"y"}}]}
        r = FakeRunner([{"id":"a"},{"id":"b"}], shows={"a":t1,"b":t2,"p1":{"task":{"id":"p1","status":"done"}}})
        args = make_args(tempfile.mkdtemp())
        rc = T.run_triage(args, runner=r)
        self.assertEqual(rc, 0)
        self.assertEqual(len(r.unblock_calls), 1)
        # one unblock comment + one escalation comment
        self.assertEqual(len(r.comment_calls), 2)
        escalation_count = sum(1 for c in r.comment_calls if "triage: escalation" in c[1])
        self.assertEqual(escalation_count, 1)

    def test_unblock_failure(self):
        task = {"id":"t3","status":"blocked","block_kind":"dependency","parents":[],"created_at":1,"block_recurrences":0,"consecutive_failures":0,"current_run_id":None,"events":[{"kind":"blocked","created_at":1,"payload":{"kind":"dependency","reason":"dep"}}]}
        r = FakeRunner([{"id":"t3"}], shows={"t3": task}, unblock_ok=False)
        args = make_args(tempfile.mkdtemp())
        rc = T.run_triage(args, runner=r)
        self.assertEqual(rc, 2)

if __name__ == "__main__":
    unittest.main()
