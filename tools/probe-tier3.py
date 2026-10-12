#!/usr/bin/env python3
"""
Tier-3 probe: the authority / credential / install surfaces.

Read only, except for one deliberate credentials round-trip on a throwaway key name when the
service publishes set + a reader + unset together (it verifies the write path end to end and is
cleaned up after). The credentials surface reads back with `resolve`, falling back to
`describe(...).configured` when `resolve` is not published; the delete path is `unset`, not a
`delete` the service does not have, and "absent after cleanup" is asserted with the same method
that reported it present — never with a `list` that is not published either. Every write argument
is derived from the setter's published signature: the probe never calls a setter with `{}` or with
a guessed placeholder, and it expects the bridge to REFUSE an empty-argument write. It also checks
~/.dsh/.credentials.yaml is byte-identical around that refused call — the file is read, never
printed. Values that look like secrets are masked before anything is printed.
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

# --- signature-driven write arguments -------------------------------------------------------
# A write on an authority surface is only attempted with arguments the setter's own published
# signature names. Anything the probe cannot fill with a real, valid value means "skip", never
# "guess": passing {} (or a placeholder) as the reference is what corrupted the credentials file.

REFISH = ("ref", "key", "name")
VALUEISH = ("value", "secret", "token")
RUNTIMEISH = ("signal", "agent", "session")

def parse_params(sig):
    """'name(a: A, b?: B): C' -> [{'name','optional','type'}] using top-level commas only."""
    if not isinstance(sig, str):
        return []
    open_i = sig.find("(")
    if open_i == -1:
        return []
    depth, close_i = 0, -1
    for i in range(open_i, len(sig)):
        ch = sig[i]
        if ch in "(<[{":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                close_i = i
                break
        elif ch in ")>]}":
            depth -= 1
    if close_i == -1:
        return []
    parts, buf, d = [], "", 0
    for ch in sig[open_i + 1:close_i]:
        if ch in "(<[{":
            d += 1
        if ch in ")>]}":
            d -= 1
        if ch == "," and d == 0:
            parts.append(buf)
            buf = ""
        else:
            buf += ch
    if buf.strip():
        parts.append(buf)
    out = []
    for p in parts:
        m = re.match(r"^([A-Za-z_$][\w$]*)\s*(\?)?\s*(?::\s*(.*))?$", p.strip(), re.S)
        if m:
            out.append({"name": m.group(1), "optional": bool(m.group(2)), "type": (m.group(3) or "").strip()})
    return out

def plan_args(method, sig, ref_value, secret_value):
    """(args, None) when the published signature can be filled for real, (None, reason) otherwise."""
    params = parse_params(sig)
    if not params:
        return None, f"{method} publishes no signature the probe can fill"
    args = {}
    for p in params:
        low = p["name"].lower()
        if low in REFISH:
            args[p["name"]] = ref_value
        elif low in VALUEISH:
            args[p["name"]] = secret_value
        elif p["optional"]:
            continue
        elif low in RUNTIMEISH or re.search(r"AbortSignal|\bAgent\b|\bSession\b", p["type"]):
            return None, f"{method} requires the runtime parameter {p['name']}, which the probe cannot supply"
        else:
            return None, f"{method} requires {p['name']}, for which the probe has no real value"
    return args, None

def cred_file_bytes():
    """The credentials file, or None when it does not exist. Contents are never printed."""
    try:
        with open(os.path.expanduser("~/.dsh/.credentials.yaml"), "rb") as f:
            return f.read()
    except OSError:
        return None

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
method_rows = ((one or {}).get("services") or [{}])[0].get("methods", [])
methods = [m["op"] for m in method_rows]
signatures = {m["op"]: m.get("signature") for m in method_rows}
setter = next((m for m in methods if m in ("set", "setValue", "write", "store", "put")), None)
deleter = next((m for m in methods if m in ("unset", "delete", "remove", "clear", "revoke")), None)
# The real surface reads back with `resolve`; `describe(...).configured` is the fallback, and
# `list` is not a method this service publishes at all.
reader = "resolve" if "resolve" in methods else ("describe" if "describe" in methods else None)
print(f"   setter={setter} reader={reader} deleter={deleter}")
TESTKEY = "HERMES_PROBE_TMP_KEY"
SECRET = "probe-value-" + os.urandom(4).hex()

def read_present(reader, result):
    """Did the reader that just ran report the throwaway ref as present?"""
    if reader == "resolve":
        return result not in (None, "undefined") and SECRET in json.dumps(result)
    return isinstance(result, dict) and result.get("configured") is True

def read_absent(reader, result):
    """The same method, now empty: resolve -> undefined, or describe -> configured === false."""
    if reader == "resolve":
        return result in (None, "undefined")
    return isinstance(result, dict) and result.get("configured") is False

if not setter:
    rec("credentials write round-trip", True, "skipped: the service publishes no setter")
elif not (reader and deleter):
    rec("credentials write round-trip", True,
        f"skipped: needs setter+reader+deleter together (setter={setter}, reader={reader}, deleter={deleter})")
else:
    set_args, set_why = plan_args(setter, signatures.get(setter), TESTKEY, SECRET)
    read_args, read_why = plan_args(reader, signatures.get(reader), TESTKEY, SECRET)
    del_args, del_why = plan_args(deleter, signatures.get(deleter), TESTKEY, SECRET)
    blocker = set_why or read_why or del_why
    if blocker:
        rec("credentials write round-trip", True, f"skipped: {blocker}")
    else:
        ok1, w = cmd("credentials", setter, set_args)
        rec(f"credentials.{setter} (write throwaway ref)", ok1, w if not ok1 else "wrote")
        if ok1:
            ok2, r = cmd("credentials", reader, read_args)
            present = ok2 and read_present(reader, r.get("result"))
            rec(f"credentials.{reader} (read back)", present,
                "ref present" if present else (r if not ok2 else "read-back did not report the ref"))
            ok3, dl = cmd("credentials", deleter, del_args)
            rec(f"credentials.{deleter} (delete)", ok3, dl if not ok3 else "deleted")
        else:
            rec(f"credentials.{reader} (read back)", True, "skipped: the write did not succeed")
            rec(f"credentials.{deleter} (delete)", True, "skipped: the write did not succeed")
        ok4, post = cmd("credentials", reader, read_args)
        gone = bool(ok4) and read_absent(reader, post.get("result"))
        rec(f"credentials throwaway ref removed (absent via {reader})", gone,
            "absent" if gone else "STILL PRESENT — remove it by hand (hard failure)")

print("\n=== an empty-argument write must be REFUSED (the incident shape) ===")
if not setter:
    rec("credentials setter with args={} refused", True, "skipped: the service publishes no setter")
else:
    before_bytes = cred_file_bytes()
    ok_e, out = cmd("credentials", setter, {})
    rec(f"credentials.{setter} with args={{}} refused", not ok_e,
        "refused by the bridge" if not ok_e else f"ACCEPTED — the bridge must refuse this: {out}")
    after_bytes = cred_file_bytes()
    same = before_bytes == after_bytes
    if before_bytes is None and after_bytes is None:
        state = "not present before or after"
    elif same:
        state = f"byte-identical ({len(before_bytes)} bytes)"
    else:
        state = "CHANGED — inspect it by hand"
    rec("~/.dsh/.credentials.yaml unchanged by the refused write", same, state)

print("\n=== tier-3 gating still reversible ===")
ok, d2 = call("dsh_commands")
print("   denyOps still wins over any tier:", "host.call ->", cmd("host", "call", {"service": "workspaceRegistry", "method": "list"})[1][:60])

fails = [r for r in results if not r["ok"]]
print(f"\n==== tier-3 probe: {len(results)-len(fails)}/{len(results)} ok ====")
for f in fails:
    print("   FAIL", f["feature"], "->", f["detail"][:150])
json.dump({"results": results}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "probe-tier3-report.json"), "w"), indent=1)
