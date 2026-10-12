#!/usr/bin/env python3
"""
One-by-one feature probe for the Hermes <-> DeepSeek Harness bridge.

Three phases:
  A. every MCP tool the bridge exposes, called at least once
  B. every curated op in the registry, through the dispatcher
  C. a non-destructive sweep of the live catalog: for each tier-2 service, call the first
     READ-ONLY-looking method with no arguments and record what happens

Nothing mutating is called: phase C only touches method names that match a read allowlist,
and workspace add/remove in phase B are done against a throwaway directory.

Writes probe-report.json next to this script and prints a summary.
"""
import json, os, subprocess, sys, time, urllib.request

URL = os.environ.get("DSH_BRIDGE_URL", "http://127.0.0.1:8791/mcp")
HERE = os.path.dirname(os.path.abspath(__file__))
TMP_WS = os.path.join(HERE, "probe-ws")
REPORT = os.path.join(HERE, "probe-report.json")

_seq = [0]
def rpc(method, params):
    _seq[0] += 1
    req = urllib.request.Request(
        URL,
        json.dumps({"jsonrpc": "2.0", "id": _seq[0], "method": method, "params": params}).encode(),
        {"content-type": "application/json", "accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        body = json.load(r)
    if body.get("error"):
        raise RuntimeError(body["error"].get("message", "rpc error"))
    return body.get("result")

def call(tool, args=None):
    """Returns (ok, payload_or_error)."""
    try:
        res = rpc("tools/call", {"name": tool, "arguments": args or {}})
    except Exception as e:
        return False, f"transport: {e}"
    if res.get("isError"):
        return False, (res.get("content") or [{}])[0].get("text", "error")[:300]
    return True, res.get("structuredContent")

def cmd(group, op, args=None):
    return call("dsh_cmd", {"group": group, "op": op, **({"args": args} if args is not None else {})})

results = {"startedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "phases": {}}
def record(phase, name, ok, detail):
    results["phases"].setdefault(phase, []).append({"feature": name, "ok": bool(ok), "detail": detail})
    mark = "ok  " if ok else "FAIL"
    print(f"  {mark} {name}" + ("" if ok else f"  -> {str(detail)[:150]}"))

print("=== A. MCP tools ===")
tools = rpc("tools/list", {})
names = [t["name"] for t in tools.get("tools", [])]
print(f"  tools/list -> {len(names)}: {', '.join(names)}")
record("A.tools", "tools/list", len(names) == 10, f"{len(names)} tools")

ok, h = call("dsh_health"); record("A.tools", "dsh_health", ok and h.get("ok") is True, h if not ok else "ok")
ok, d = call("dsh_commands"); record("A.tools", "dsh_commands", ok and "catalog" in (d or {}), (d or {}).get("counts") if ok else d)
ok, w = call("dsh_workspaces"); record("A.tools", "dsh_workspaces", ok and isinstance(w.get("workspaces"), list), f"count={w.get('count')}" if ok else w)
ok, sg = call("dsh_sessions"); record("A.tools", "dsh_sessions", ok, f"pool={sg.get('poolSize')}" if ok else sg)
sid = (sg.get("sessions") or [{}])[0].get("sessionId") if ok else None
if sid:
    ok, st = call("dsh_stats", {"session_id": sid}); record("A.tools", "dsh_stats", ok, f"{st.get('inputTokens')} in / {st.get('cacheReadTokens')} cached" if ok else st)
else:
    record("A.tools", "dsh_stats", False, "no warm session to sample")
ok, dbg = call("dsh_debug"); record("A.tools", "dsh_debug", ok, f"{len(dbg.get('sessions', []))} sessions" if ok else dbg)
os.makedirs(TMP_WS, exist_ok=True)
ok, add = call("dsh_workspace_add", {"path": TMP_WS, "title": "probe-ws"}); record("A.tools", "dsh_workspace_add", ok, add if not ok else f"created={add.get('created')}")
ok, rem = call("dsh_workspace_remove", {"path": TMP_WS}); record("A.tools", "dsh_workspace_remove", ok, rem if not ok else f"via {rem.get('via')}")
scratch = os.path.join(HERE, "scratch-run"); os.makedirs(scratch, exist_ok=True)
ok, run = call("dsh_run", {"task": "Reply with the single word PONG.", "cwd": scratch, "title": "probe run"})
record("A.tools", "dsh_run", ok and isinstance(run.get("sessionId"), str), (run or {}).get("text") if ok else run)
record("A.tools", "dsh_cmd", cmd("bridge", "health")[0], "bridge.health")

print("\n=== B. curated ops ===")
for group, op, args in [
    ("bridge", "health", None),
    ("session", "list", None),
    ("workspace", "list", None),
    ("harness", "tools", None),
    ("harness", "services", None),
    ("harness", "inspect", None),
    ("harness", "catalog", None),
    ("host", "call", {"service": "workspaceRegistry", "method": "list"}),
]:
    ok, out = cmd(group, op, args)
    expect_fail = op == "call"  # denyOps by design
    record("B.curated", f"{group}.{op}", (not ok) if expect_fail else ok, out if not expect_fail or not ok else "permitted (unexpected)")
if sid:
    ok, out = cmd("session", "stats", {"session_id": sid})
    record("B.curated", "session.stats", ok, out if not ok else "ok")

print("\n=== C. catalog sweep (read-only methods, no arguments) ===")
ok, cat = cmd("harness", "catalog")
services = (cat or {}).get("services", [])
READ = ("list", "get", "describe", "snapshot", "status", "current", "names", "entries", "size", "has",
        "find", "resolve", "stat", "read", "query", "info", "metadata", "state", "count", "keys",
        "values", "inspect", "preview", "lookup", "search", "show", "can")
reachable = callable_ok = needs_args = unreachable = no_safe = 0
for svc in services:
    key = svc["key"]
    if svc.get("tier") == 3:
        record("C.catalog", f"{key} (tier 3)", True, "skipped: gated")
        continue
    ok, one = cmd("harness", "catalog", {"service": key})
    methods = ((one or {}).get("services") or [{}])[0].get("methods", []) if ok else []
    pick = next((m["op"] for m in methods if m["op"].startswith(READ)), None)
    if pick is None:
        no_safe += 1
        record("C.catalog", f"{key}", True, f"no read-only method ({len(methods)} methods)")
        continue
    ok, out = cmd(key, pick, {})
    if ok:
        reachable += 1
        callable_ok += 1
        record("C.catalog", f"{key}.{pick}", True, "ok")
    else:
        msg = str(out)
        if "is not reachable" in msg:
            unreachable += 1
        elif "requires" in msg or "argument" in msg.lower() or "cannot read" in msg or "undefined" in msg:
            needs_args += 1
        else:
            needs_args += 1
        record("C.catalog", f"{key}.{pick}", False, msg[:160])

summary = {
    "tools": len(results["phases"].get("A.tools", [])),
    "curated": len(results["phases"].get("B.curated", [])),
    "catalogServices": len(services),
    "catalogCalled": reachable + needs_args + unreachable,
    "catalogOk": callable_ok,
    "catalogNeedsArgsOrOther": needs_args,
    "catalogUnreachable": unreachable,
    "catalogNoReadMethod": no_safe,
}
results["summary"] = summary
results["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
with open(REPORT, "w") as f:
    json.dump(results, f, indent=1)
try:
    subprocess.run(["rmdir", TMP_WS], capture_output=True)
except Exception:
    pass

print("\n================ SUMMARY ================")
for k, v in summary.items():
    print(f"  {k:24} {v}")
fails = [x for p in results["phases"].values() for x in p if not x["ok"]]
print(f"  {'failures (see report)':24} {len(fails)}")
print(f"\nfull report: {REPORT}")
