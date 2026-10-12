# dsh-hermes-thin

A **thin MCP bridge** that lets Hermes Agent drive the **DeepSeek Harness desktop app**
as its coding surface: Hermes stays the orchestrator, every line of code is written by an
agent *inside the app* — visible in its window, grouped under the right project.

One direction only: **Hermes → harness.** Hermes is the MCP client, this plugin is the
server. It runs in the app's own process, so the sessions it creates are ordinary harness
sessions.

## What it exposes (8 tools, no more)

| Tool | Purpose |
|---|---|
| `dsh_run` | Run a coding task in a repo. Reuses one warm session per cwd. Returns the final text, tool-call count, and token/cache figures. |
| `dsh_sessions` | The warm sessions the bridge is holding, with per-session cache-hit rate and token totals. |
| `dsh_stats` | Token/cache figures for one session (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `cacheHitRate`). |
| `dsh_workspaces` | The projects (repo folders) the app shows in its sidebar, each with its session count and whether this bridge holds a warm session there. |
| `dsh_workspace_add` | Register a folder as a project so its sessions appear under it. Idempotent, and retitles an existing project when `title` differs. |
| `dsh_workspace_remove` | Remove a project **registration** — folders, files and session histories are never deleted. Accepts `path` or `id`. |
| `dsh_health` | Pinned route, permission preset, resident-session count, workspace roots. |
| `dsh_debug` | Diagnostics: setup() outcomes, last error, each resident session's live event types, request header. |

## Two halves: curated ops + the live catalog

**Curated ops** (the ergonomic path — warm sessions, pinned route/permissions):

| group | ops |
|---|---|
| `run` | `task` |
| `session` | `list`, `stats` |
| `workspace` | `list`, `add`, `remove` |
| `bridge` | `health` |
| `harness` | `tools`, `services`, `inspect`, `catalog` |
| `host` | `call` (tier 2 escape hatch) |

**The live catalog** — the running app publishes its own service directory (Cordis
inspection registry → `Service` provider), and every one of those methods is dispatchable
through the same envelope:

```jsonc
{ "group": "sessions",          "op": "list",   "args": {} }        // Host service method
{ "group": "workspaceRegistry",  "op": "list",   "args": {} }
{ "group": "sessionQuery",       "op": "…",      "args": { … } }
```

Discover it with `harness.catalog` (91 services at the time of writing), or
`harness.catalog { service: "sessions" }` for method names + signatures. A typo costs
nothing: the dispatcher validates the method against the catalog before calling.

## Tiers

| Tier | What it covers | Switch |
|---|---|---|
| 1 | the curated ops above | always on |
| 2 | **every catalog method** (any Host service) | `enableTier2: true` |
| 3 | authority / credential / install surfaces — `credentials`, `deepseekAccount`, `authorization`, `pluginManager`, `configEditor`, telemetry | `enableTier3: true` |

Catalog methods all default to tier 2 even when they only read, because the catalog
carries no read/write metadata — a generic call has to be treated as mutation-capable.
`denyOps` always wins over any tier; `allowOps` can lift a single op out of a disabled tier.



## Repo/project interoperability (one direction: Hermes → harness)

- **A repo Hermes names becomes a project in the app.** `dsh_run` attaches the session it
  creates to a workspace for that cwd; `dsh_workspace_add` registers a folder directly, so a
  project Hermes made shows up in the sidebar before any task runs.
- **`dsh_workspaces` is how Hermes sees which repos are in play** — and which of them still
  hold a warm session, so it can route to a repo that is already loaded.
- **Edits flow through the filesystem, not an API.** Both sides work the same folder; the DSH
  agent's changes are just files, so Hermes reads and updates them with its normal tools, and
  git is the contract for "what changed". (The harness also emits a per-turn `workspace/changes`
  event for its own changed-files card — the bridge does not consume it.)
- **No session interoperability, by design.** Hermes does not read harness sessions, harness
  sessions are not resumable from Hermes, and nothing calls the other direction.
- Removing a project is registration-only: the directory, its files and its session logs stay
  exactly where they are.

## Design rules (each one exists for a measured reason)

1. **One resident agent per cwd, reused.** A fresh agent re-sends the whole project context
   as an uncached prefix; reuse is the entire cost story (community measurement: 15–20×
   cheaper than one-shot CLI runs).
2. **Authorisation lives on Hermes.** The bridge never prompts. It pins the
   `hermes-managed` preset — sandbox `workspace-write` + approval `never` — into every
   session it creates, so the harness never waits for a human and never fails closed on a
   missing answerer. Hermes decides *whether* to dispatch and *where*; the sandbox still
   confines the blast radius to the repo. Hand-opened app sessions are untouched.
3. **Nothing cache-hostile at runtime.** No plugin/tool-roster changes, no model
   switching, no plan-mode toggling on a live session. Install plugins between projects.
4. **No dependencies.** The MCP surface (initialize / tools/list / tools/call) is
   hand-rolled over `node:http`, so there is no `@modelcontextprotocol/sdk` to keep in
   sync. `@deepseek-ai/*` are `peerDependencies` on purpose: at the profile's lookup
   position, peers resolve to the **host installation's** own copies, which is what keeps
   Symbol identity — and therefore agent preset mounting — intact. Adding a real
   dependency copy is the "dual-package hazard": the agent then answers with no tools.

## Install (into the `desktop` profile)

The `dsh` CLI **refuses** to touch the desktop profile (`profile "desktop" is managed
exclusively by the Electron application`), so the install is the documented pnpm step done
by hand — the same end state `dsh plugin add` produces:

```sh
PLUGIN="/absolute/path/to/dsh-bridge/plugin"
P="$HOME/.dsh/profiles/desktop"

# 1. link the bundle into the profile (any pnpm works; the app ships one at
#    "DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm")
cd "$P" && pnpm add -w "link:$PLUGIN"

# 2. register it as a bundle in the profile manifest
python3 - "$P/package.json" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p))
d.setdefault("dependencies",{}).setdefault("dsh-hermes-thin","link:/absolute/path/to/dsh-bridge/plugin")
d.setdefault("dsh",{}).setdefault("profile",{}).setdefault("bundles",[]).append("dsh-hermes-thin")
json.dump(d,open(p,"w"),indent=2)
PY

# 3. quit the app COMPLETELY, then relaunch it — patch layers are read at boot
osascript -e 'tell application "DeepSeek Harness" to quit'; sleep 5
open -a 'DeepSeek Harness'
curl -s http://127.0.0.1:8791/health
```

### Register with Hermes

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  dsh:
    url: "http://127.0.0.1:8791/mcp"     # stdio is not used: the server lives in the app
    timeout: 1800                        # coding turns are long; keep it well above taskTimeoutMs
```

Hermes registers the tools as `mcp_dsh_dsh_run` etc. Restart Hermes after editing.

### Verify

```sh
node plugin/smoke.mjs                       # handshake + tools/list + health (no tokens spent)
node plugin/smoke.mjs --run /path/to/repo   # one real task, then a second call to show cache hits
```

The number that matters is **run #2's `cacheHitRate`**: a warm resident session should show
`cacheRead` far above `input` (uncached). Compare with `dsh --profile headless` on the same
task: that path re-sends the whole prefix per invocation.

## Config (bundle patch: `cordis.patch.yml`)

| Field | Default | Notes |
|---|---|---|
| `host` / `port` | `127.0.0.1` / `8791` | Its own loopback server — independent of the app's own (random) port |
| `provider` / `model` | `openrouter` / `deepseek/deepseek-v4.1-flash` | Must match a route the profile already configures |
| `reasoningEffort` | `low` | Adapter default is `high`; this is the biggest single line on the bill |
| `preset` | `standard` | Harness agent preset (tool composition) |
| `permissionPreset` | `hermes-managed` | Pinned into bridge-created sessions |
| `workspaceRoots` | `[]` | Optional cwd allow-list; empty = any path Hermes names |
| `maxAgents` | `8` | Resident sessions kept warm (LRU eviction beyond this) |
| `taskTimeoutMs` | `1800000` | Per-task ceiling; on timeout the result returns `timedOut: true` with partial stats |
| `authToken` | `''` | Set it if `host` is ever not loopback |
| `enableTier2` | `false` | Exposes every method the live service catalog publishes |
| `enableTier3` | `false` | Exposes authority/credential/install services (`credentials`, `deepseekAccount`, `authorization`, `pluginManager`, `configEditor`, telemetry) |
| `allowOps` / `denyOps` | `[]` | `"group.op"` overrides; deny beats allow and beats tier |
| `audit` / `auditLimit` | `true` / `200` | Ring buffer of dispatched ops, readable via `dsh_commands` |
| `catalogTtlMs` | `60000` | How long a fetched service catalog stays fresh |

## Pitfalls this repo has already hit

- **The catalog is what the codebase *can* publish, not what is *live*.** `harness.catalog` reads
  the `Service` provider registry (91 services here); `dsh_commands.mountedServices` lists what
  `ctx.inject` actually resolved in this composition (44 here). A method can be enumerable and
  still be unreachable — the dispatcher says so instead of failing obscurely.
- **Dedupe argument candidates by class tag, not `typeof`.** An `AbortSignal` and a plain object
  are both `"object"`, so a typeof-keyed dedupe silently discards the signature-derived
  `[signal]` candidate — which is the only one that works for `listSessions(signal?: AbortSignal)`.
  Use `Object.prototype.toString.call(v)` plus arity.
- **Signatures, not guesses.** Method names and parameter lists come from the catalog. The
  dispatcher fills only runtime handles it *holds* (agent, signal, session) and never invents
  domain data — so a method needing a real id/ref/iterable returns that service's own error,
  which is the correct behaviour.

- **YAML is the whole file's problem.** Appending an entry whose comment line lost its `#`
  broke the parser and the app refused to boot. Patch files are read at boot; edit them
  with a YAML library, not string concatenation, and validate before relaunching.
- **A bad patch is survivable.** The app's crash dialog backs the file up to
  `cordis.patch.yml.bak-<stamp>`, resets the live file, and carries on — your rows are
  recoverable from the backup.
- **The app must be relaunched, not focused.** `open -a` on a running instance does nothing;
  the composed tree is loaded once at boot.
- **Session format v4 refuses `{kind:'plugin', plugin:…}` messages.** They are dropped with
  `format v4 message requires a producer-owned source kind`, and the only trace is a
  `turn/end` carrying `reason.kind === 'error'` — zero tokens, zero steps, no exception.
  Use your own producer kind (`source: { kind: 'hermes-thin' }`), as the shipped webhook
  row does.
- **Cordis guards `ctx` property access.** Touching a service that is not in `inject` throws;
  inject every service you read, cosmetic ones included.
- **`whenIdle()` can wait forever if the agent decides to ask a question.** With `never`
  approvals it will not stop for permission, but a question tool call still blocks. The
  per-task timeout is the guard; answers are a v2 concern.
- **Watch the cache numbers, not the exit path.** `dsh_debug` reports each resident session's
  in-memory event types and request header; that is what told us the message was being
  rejected.

## Uninstall

```sh
cd "$HOME/.dsh/profiles/desktop"
pnpm remove dsh-hermes-thin
python3 - <<'PY'
import json,os
p=os.path.expanduser("~/.dsh/profiles/desktop/package.json"); d=json.load(open(p))
b=d.get("dsh",{}).get("profile",{}).get("bundles",[])
if "dsh-hermes-thin" in b: b.remove("dsh-hermes-thin")
json.dump(d,open(p,"w"),indent=2)
PY
# relaunch the app; then remove the mcp_servers.dsh block from ~/.hermes/config.yaml
```

## Layout

```
plugin/            the installable bundle (index.js, cordis.patch.yml, smoke.mjs, README.md)
reference/         shallow clones of three community bridges, kept for comparison
fetch-docs.sh      fetches DeepSeek's own docs and the reference clones
scratch-run/       throwaway repo used by the smoke test
```
