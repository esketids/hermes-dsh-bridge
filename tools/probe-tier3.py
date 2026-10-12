#!/usr/bin/env python3
"""
Tier-3 probe: the authority / credential / install surfaces.

Read only, except for one deliberate credentials round-trip on a throwaway key name when the
service supports set+delete (it verifies the write path end to end and is cleaned up after).
Values that look like secrets are masked before anything is printed.
"""
import json, os, re, urllib.request

URL = os.environ.get("DSH_BRIDGE_URL", "http://127.0.0.1:8791/mcp")
_seq = [0]
def call(tool, args=None):
    _seq[0] += 1
    req = urllib.request.Request(URL, json.dumps({"jsonrpc": "2.0", "id": _seq[0], "method": "tools/call",
        "params": {"name": tool, "arguments": args or {}}}).encode(), {"content-type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=180))["result"]
    return (False, r["content"][0]["text"][:240]) if r.get("isError") else (True, r.get("structuredContent"))
def cmd(g, o, a=None):
    return call("dsh_cmd", {"group": g, "op": o, **({"args": a} if a is not None else {})})

SECRETY = re.compile(r"key|token|secret|password|credential|apikey|api_key|auth", re.I)
def mask(v, key=""):
    if isinstance(v, dict):
        return {k: mask(x, k) for k, x in v.items()}
    if isinstance(v, list):
        return [mask(x, key) for x in v]
    if isinstance(v, str):
        if SECRETY.search(key):
            return f"<{len(v)} chars, masked>"
        if len(v) > 48:                      # long opaque blob under a non-obvious name
            return f"<{len(v)} chars, masked: {v[:6]}…>"
    return v
def show(v, limit=340):
    return json.dumps(mask(v))[:limit]

results = []
def rec(feature, ok, detail):
    results.append({"feature": feature, "ok": bool(ok), "detail": str(detail)[:200]})
    print(f"  {'ok  ' if ok else 'FAIL'} {feature}" + (f"  -> {detail}" if not ok else (f"  -> {detail}" if detail else "")))

print("=== tier flags ===")
ok, d = call("dsh_commands")
print("  ", json.dumps(d["tiers"]))
mounted = set(d["mountedServices"])
t3 = [s["key"] for s in d["catalog"]["services"] if s["tier"] == 3]
print("   tier-3 mounted:", [k for k in t3 if k in mounted])
rec("tier3 enabled", "enabled" in d["tiers"]["tier3"], d["tiers"]["tier3"])

READ = ("list", "get", "describe", "entries", "status", "current", "configuration", "keys", "summary", "info", "name", "read")
for svc in [k for k in t3 if k in mounted]:
    ok, one = cmd("harness", "catalog", {"service": svc})
    rows = (one or {}).get("services") or [{}]
    methods = [m["op"] for m in rows[0].get("methods", [])]
    print(f"\n=== {svc} ({len(methods)} methods{', from live object' if rows[0].get('methodsFrom') else ''}) ===")
    print("   methods:", ", ".join(methods[:14]) + (" …" if len(methods) > 14 else ""))
    picked = [m for m in methods if m.startswith(READ)][:3]
    if not picked:
        rec(f"{svc}: no read method", True, "nothing safe to call")
    for m in picked:
        ok2, out = cmd(svc, m, {})
        rec(f"{svc}.{m}", ok2, show(out.get("result") if ok2 else out) if ok2 else out)

print("\n=== credentials write path (throwaway key, cleaned up) ===")
ok, one = cmd("harness", "catalog", {"service": "credentials"})
methods = [m["op"] for m in ((one or {}).get("services") or [{}])[0].get("methods", [])]
setter = next((m for m in methods if m in ("set", "setValue", "write", "store", "put")), None)
deleter = next((m for m in methods if m in ("delete", "remove", "unset", "clear", "revoke")), None)
getter = next((m for m in methods if m in ("get", "read", "value", "readValue")), None)
print(f"   setter={setter} getter={getter} deleter={deleter}")
if setter and deleter:
    TESTKEY = "HERMES_PROBE_TMP_KEY"
    ok0, pre = cmd("credentials", "list", {})
    before = show(pre.get("result") if ok0 else pre, 200)
    ok1, w = cmd("credentials", setter, {} if not getter else None)
    # shapes vary: try object then positional
    if not ok1:
        ok1, w = cmd("credentials", setter, {"key": TESTKEY, "value": "probe-value"})
    if not ok1:
        ok1, w = cmd("credentials", setter, [TESTKEY, "probe-value"])
    rec(f"credentials.{setter} (throwaway key)", ok1, w if not ok1 else "wrote")
    if getter:
        ok2, r = cmd("credentials", getter, {"key": TESTKEY})
        if not ok2:
            ok2, r = cmd("credentials", getter, [TESTKEY])
        rec(f"credentials.{getter} (read back)", ok2, show(r.get("result") if ok2 else r, 120) if ok2 else r)
    ok3, dl = cmd("credentials", deleter, {"key": TESTKEY})
    if not ok3:
        ok3, dl = cmd("credentials", deleter, [TESTKEY])
    rec(f"credentials.{deleter} (cleanup)", ok3, dl if not ok3 else "deleted")
    ok4, post = cmd("credentials", "list", {})
    if ok4:
        res = post.get("result")
        gone = TESTKEY not in json.dumps(res)
        rec("credentials cleaned up (key absent)", gone, "absent" if gone else "STILL PRESENT — check by hand")
else:
    rec("credentials write round-trip", True, f"skipped: no setter+deleter pair (setter={setter}, deleter={deleter})")

print("\n=== tier-3 gating still reversible ===")
ok, d2 = call("dsh_commands")
print("   denyOps still wins over any tier:", "host.call ->", cmd("host", "call", {"service": "workspaceRegistry", "method": "list"})[1][:60])

fails = [r for r in results if not r["ok"]]
print(f"\n==== tier-3 probe: {len(results)-len(fails)}/{len(results)} ok ====")
for f in fails:
    print("   FAIL", f["feature"], "->", f["detail"][:150])
json.dump({"results": results}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "probe-tier3-report.json"), "w"), indent=1)
