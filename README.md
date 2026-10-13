# hermes-dsh-bridge

A one-way bridge that lets **Hermes Agent** (the orchestrator) drive the **DeepSeek Harness desktop app** as its coding surface.

Hermes decides *what* to do. The harness does the *coding* — reading files, editing, running commands — in a real harness session that you can watch in the app's own UI. Hermes talks to it over MCP; nothing flows the other way.

```
Hermes ──MCP (loopback HTTP)──▶ dsh-hermes-thin (a plugin inside the DSH app)
   ▲                                    │
   │  tool result                       ├─ creates / reuses real harness sessions
   └────────────────────────────────────┴─ they appear in the app UI, grouped by project
```

---

## Why it's shaped this way

Three deliberate choices, each with a reason:

1. **One-way, MCP, loopback.** Hermes is the MCP client; a plugin inside the app is the server. The app's process is the boundary — `ctx.*` services only exist in there, so a plugin is the only thing that can convert a command into a harness action. No ports exposed off the machine, no reverse channel to secure.

2. **Authorization lives on Hermes, not in the harness.** Every session the bridge creates is pinned to a `hermes-managed` permission preset: sandbox `workspace-write`, approval `never`. The harness never prompts and never fails closed on a missing answerer; Hermes is the only thing that decides what gets dispatched and against which directory. The sandbox still confines writes to the project.

3. **Resident sessions, not one-shot runs.** The bridge keeps one warm agent per working directory and reuses it. A session-per-task integration re-sends the whole project context as an uncached prefix on every call; reusing a warm session keeps the provider's prompt cache hot. In a measured A/B on the same repo and tasks, the warm path cost **~1.7× less** and hit **97% cache** on the third chained task.

## How a task flows

```
you ──▶ Hermes (agent loop)
          │  decides "this is coding work"
          ▼
     MCP client  ──initialize / tools/list / tools/call──▶  127.0.0.1:<port>/mcp
                                                              │
                    ┌─────────────────────────────────────────┘
                    ▼
        dsh-hermes-thin (plugin, inside the DSH desktop app)
          │  resolves the command: curated op or live-catalog method
          │  applies tier + allow/deny policy, writes the audit entry
          ▼
        Cordis host services:  agents.create · agentPresets.mount ·
                               permissionPresets.set · workspaceRegistry.attachSession
          │
          ▼
        a real harness session  (pinned model route, workdir = the repo)
          │  bash · read · write · edit · glob · grep · subagent · …
          ▼
        files on disk   ◀─── the shared surface ───▶  the app's UI (a sibling client)
          │
          ▼
        result + token/cache stats ──▶ back up the same pipe to Hermes
```

## Full routing — every component

The short version above is the shape; this is the whole path, including the handshakes, the process boundary, the config locations and the return leg.

```
┌─ YOU ────────────────────────────────────────────────────────────────────────┐
│  a Hermes session: "use the harness to …"                                    │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌─ HERMES ─────────────────────────────────────────────────────────────────────┐
│  agent loop decides this is coding work → calls an mcp_dsh_* tool            │
│  MCP CLIENT — config: ~/.hermes/config.yaml                                  │
│      mcp_servers.dsh.url             http://127.0.0.1:<port>/mcp  (loopback) │
│      mcp_servers.dsh.connect_timeout 30s                                     │
│      mcp_servers.dsh.timeout         2700s   (long coding turns)             │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │  HTTP POST · JSON-RPC 2.0 · one direction only
   ┌─ HANDSHAKE 1 — transport (once, at Hermes session start) ────────────────┐
   │  initialize                → serverInfo + Mcp-Session-Id                 │
   │  notifications/initialized → 202                                         │
   │  tools/list                → 11 tools    ⟵ new tools need /reload-mcp    │
   └──────────────────────────────────────────────────────────────────────────┘
                               ▼
╔═ DSH DESKTOP APP PROCESS (Electron) ═════════════════════════════════════════╗
║                                                                              ║
║  ┌─ dsh-hermes-thin (Cordis plugin) ───────────────────────────────────────┐ ║
║  │  node:http server on 127.0.0.1:<port>                                   │ ║
║  │  MCP layer: initialize · tools/list · tools/call                        │ ║
║  │      ▼                                                                  │ ║
║  │  tools: dsh_run · dsh_sessions · dsh_stats · dsh_workspaces ·           │ ║
║  │         dsh_workspace_add / remove · dsh_commands · dsh_cmd ·           │ ║
║  │         dsh_health · dsh_debug                                          │ ║
║  │      ▼                                                                  │ ║
║  │  OPS REGISTRY ── tier gate (1/2/3) ── allowOps / denyOps ── audit ring   │ ║
║  │      ▼                                                                  │ ║
║  │  harness glue                                                           │ ║
║  └──────┬──────────────────────────────────────────────────────────────────┘ ║
║         ▼                                                                    ║
║  ┌─ CORDIS HOST SERVICES ──────────────────────────────────────────────────┐ ║
║  │  agents.create / resume        → agent + session                        │ ║
║  │  agentPresets.mount            → the agent's toolset                    │ ║
║  │  permissionPresets.set         → "hermes-managed" (workspace-write +    │ ║
║  │                                  never): the harness never prompts      │ ║
║  │  workspaceRegistry / Controller→ the repo becomes a project in the app  │ ║
║  │  sessionTitle · session log    → labels; results + token stats read back│ ║
║  └──────┬──────────────────────────────────────────────────────────────────┘ ║
║         ▼                                                                    ║
║  ┌─ THE CODING AGENT (a real harness session) ─────────────────────────────┐ ║
║  │  route: <provider>/<model> · reasoningEffort: medium · workdir = repo   │ ║
║  │  tools: bash · read · write · edit · glob · grep · subagent · …         │ ║
║  └──────┬──────────────────────────────────────────────────────────────────┘ ║
║         ▼                                                                    ║
║  ┌─ THE APP UI (sibling client of the same services — not in the path) ────┐ ║
║  │  the session appears in the sidebar under its project; changed-files card│ ║
║  └─────────────────────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════════════════╝
                               ▼
                      ┌─ MODEL PROVIDER ─┐  (whatever <provider> names)
                      └──────────────────┘
                               ▼
          ┌─ DISK — the real shared surface ─────────────────┐
          │  the repo you named                              │
          │  $DSH_HOME/sessions/<cwd>/session-*/             │
          │  $DSH_HOME/storages/workspace.json   (projects)  │
          │  $DSH_HOME/.credentials.yaml         (API keys)  │
          └──────────────────────────────────────────────────┘
                               │
      ┌────────────────────────┴─ RETURN PATH ───────────────────────┐
      │  result + tokens/cache folded from the session log            │
      │  ▲ MCP tool result ▲ Hermes sees a normal tool result         │
      └───────────────────────────────────────────────────────────────┘

HANDSHAKE 2 — capability (on demand, inside any call)
    dsh_commands  →  the registry: ops, tiers, what is callable right now,
                     recent audit entries. Read fresh every time, which is why
                     new ops never need a Hermes reload (only new MCP tools do).

CONFIG LAYERS (last wins)
    bundle patch → profile patch (id: hermes-thin) → $DSH_HOME/cordis.patch.yml
    → --patch overlays → per-call tool arguments
SECRETS
    $DSH_HOME/.credentials.yaml or the environment — never in a patch file
```

## What's in the box

Two halves, one contract:

| Path | Half | What it is |
|---|---|---|
| `plugin/` | DSH side | the bridge: `index.js` (zero dependencies), `package.json` (bundle manifest), `cordis.patch.yml` (bundled defaults), `smoke.mjs` (standalone verifier), `bench.mjs` (cost experiment), `README.md` (technical detail) |
| `hermes/` | Hermes side | the MCP server registration (`mcp-config.yaml`) + instructions. No code — Hermes is the client; a URL is the whole footprint |
| `skills/deepseek-harness/` | reference | the agent's operating skill + references: install recipe, architecture rationale, token/cache economics, package map |
| `tools/` | diagnostics | `probe.py` (tiers 1–2 sweep), `probe-tier3.py` (tier 3), and one anonymised example report |

## Quickstart

**Prerequisites**: the DeepSeek Harness **desktop app** installed and opened at least once, Node ≥ 20, and Hermes Agent.

### 1. Install the plugin into the app's profile (DSH side)

The app owns its `desktop` profile, and the `dsh` CLI refuses to manage it — so the install is three edits by hand:

```bash
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PLUGIN="$(pwd)/plugin"

# a) register the plugin as a link dependency of the profile
cd "$DSH_HOME/profiles/desktop"
pnpm add -w "link:$PLUGIN"          # writes node_modules/dsh-hermes-thin -> your plugin dir

# b) add it to the profile's bundle list
#    (profile package.json -> "dsh": { "profile": { "bundles": [ … "dsh-hermes-thin" ] } })

# c) add the config row to profiles/desktop/cordis.patch.yml
```

The row to add (also shipped as `plugin/cordis.patch.yml`, the bundle-level default — a row with the same `id` in your **profile** patch overrides it):

```yaml
- insert:
    - id: hermes-thin
      name: dsh-hermes-thin
      config:
        host: 127.0.0.1
        port: 8791
        provider: <provider>          # e.g. openrouter
        model: <provider>/<model>     # e.g. deepseek/deepseek-v4.1-flash
        reasoningEffort: medium       # off | low | medium | high
        preset: standard
        permissionPreset: hermes-managed
        workspaceRoots: []            # optional: confine tasks to these roots
        maxAgents: 8
        taskTimeoutMs: 1800000
        enableTier2: false            # live-catalog dispatch (mutations)
        enableTier3: false            # credentials / account / plugin installs
```

**Then fully quit and reopen the app** — patch changes load at boot:

```bash
curl -s http://127.0.0.1:8791/health
```

### 2. Give it a model and a key

The bridge inherits the harness's credentials. Put your key where the harness keeps them — **never in a patch file**:

```yaml
# ~/.dsh/.credentials.yaml   (or export it in the environment)
OPENROUTER_API_KEY: <your key>
```

Any provider the harness serves works; point `provider`/`model` at one of them.

### 3. Register it with Hermes (Hermes side)

```bash
hermes mcp add dsh --url http://127.0.0.1:8791/mcp --connect-timeout 30
hermes config set mcp_servers.dsh.timeout 2700     # long coding turns
```

Or merge `hermes/mcp-config.yaml` into `~/.hermes/config.yaml` by hand. Then load the tools — `tools/list` is fetched at session start:

```
/reload-mcp        # in an existing session, or just start a new one
```

### 4. Verify

```bash
curl -s http://127.0.0.1:8791/health          # {"ok":true, ...}
cd plugin && node smoke.mjs                   # handshake + tools/list + health
node smoke.mjs --run /path/to/repo            # a real tiny task, end to end
```

## Configuration reference

Settings live in the config row (`id: hermes-thin`). Precedence, last wins: **bundle patch → profile patch → home `~/.dsh/cordis.patch.yml` → `--patch` overlays**, with per-call tool arguments on top. Everything here requires an **app restart** except tool arguments.

| Field | Default | What it does |
|---|---|---|
| `host` / `port` | `127.0.0.1` / `8791` | the MCP endpoint (must match `hermes/mcp-config.yaml`) |
| `provider` / `model` | — | the pinned route for every session the bridge creates |
| `reasoningEffort` | `medium` | `off` / `low` / `medium` / `high` — the biggest line on a token bill |
| `maxTokens` | adapter default | output cap per model call |
| `preset` | `standard` | the agent preset mounted into each session (its toolset) |
| `permissionPreset` | `hermes-managed` | sandbox + approval policy pinned into each session |
| `workspaceRoots` | `[]` | optional allow-list of directories tasks may run in |
| `maxAgents` | `8` | resident sessions kept warm (one per working directory) |
| `taskTimeoutMs` | `1800000` | per-task ceiling; also the guard when nothing answers a question |
| `enableTier2` | `false` | expose the harness's live service catalog (mutations included) |
| `enableTier3` | `false` | expose credentials / account / plugin-install surfaces |
| `allowOps` / `denyOps` | `[]` | explicit overrides — a deny always wins over any tier |
| `audit` / `auditLimit` | `true` / `200` | record dispatches in a ring buffer (`dsh_debug` shows it) |
| `catalogTtlMs` | `60000` | how long the discovered service catalog is cached |
| `authToken` | `''` | optional bearer token for every request but `/health` |

**Secrets never go here.** They live in `~/.dsh/.credentials.yaml` or the environment.

## What Hermes gets

Eleven MCP tools, namespaced `mcp_dsh_*`:

| Tool | Purpose |
|---|---|
| `dsh_run` | run a coding task in a repo (reuses the resident session) |
| `dsh_sessions` / `dsh_stats` | warm sessions; token and cache-hit figures |
| `dsh_workspaces` / `dsh_workspace_add` / `dsh_workspace_remove` | the app's project list (registration only — never touches files) |
| `dsh_commands` / `dsh_cmd` | the **self-describing command registry**: describe what's callable, dispatch it |
| `dsh_health` / `dsh_debug` | route, presets, tiers, live event stream |

Through `dsh_cmd`, the bridge also exposes the harness's **own live service catalog**: ask `harness.catalog` what exists and dispatch any method as `{group: <service>, op: <method>, args}`. New harness capability becomes reachable without touching either side.

**Tiers** gate exposure:

| Tier | Covers | Default |
|---|---|---|
| 1 | curated ops: run tasks, sessions, projects, discovery | on |
| 2 | every method in the live service catalog (mutations included) | off |
| 3 | `credentials`, `deepseekAccount`, `authorization`, `pluginManager`, config editing | off |

Writes on an authority/credential surface are held to a higher bar than reads: `dsh_cmd` runs them only with explicit arguments that satisfy the method's **published signature**, and never auto-fills them from whatever the bridge happens to hold. `args` may be given either as an object keyed by the method's published parameter names — the normal way — or as a positional array. That rule is not theoretical — a tier-3 probe once called a credentials setter with `args: {}`, the empty object went through as the credential reference, and the app refused to boot until `~/.dsh/.credentials.yaml` was repaired by hand.

`dsh_cmd` also accepts `dry_run: true`, which runs the same checks — tier verdict, method existence, write guard — and **reports reachability without invoking the op**, curated or catalog.

Methods that take a callback/producer cannot cross the MCP boundary, and the bridge refuses them rather than passing a placeholder — because one such call (`systemPrompt.tools`) registered a producer with no usable callback and killed every model turn until the app was restarted; the reviewed registry writers (`systemPrompt.*`, `tools.presentAs`, `tools.restrict`) are refused the same way.

## Using it from Hermes

```
"Use the harness to add a health endpoint to the API and run the tests"
"Have the harness summarise what changed in this repo today"
"List the harness's projects"                     → dsh_workspaces
"What can the harness do right now?"              → dsh_commands / harness.catalog
"Show token spend and cache hits for the last session"  → dsh_stats
```

## Diagnostics

### First response

```bash
curl -s http://127.0.0.1:8791/health     # is the bridge up?
```

| Symptom | Check | Meaning |
|---|---|---|
| Hermes doesn't see the tools | `/reload-mcp`, then `hermes mcp list` | `tools/list` is fetched at session start — a new tool needs a reload |
| `/health` refuses to connect | is the DSH **app** running? | the bridge lives in the app's process; it is not a daemon |
| Tools work but the agent returns text and does nothing | `dsh_debug` → the `turn/end` reason | the silent-message class of failure; the session log says why |
| *"tier N required"* | `dsh_commands` | working as designed — flip the flag in the config row and restart |
| *"service X is not reachable in this composition"* | `harness.catalog` | the catalog lists every service the code *can* publish; fewer are actually mounted |
| *"unknown method"* | `harness.inspect {input:{service:"X"}}` | names are validated against the live catalog — typos cost nothing |
| Odd argument errors | `harness.inspect` → read the signature | pass matching arguments; the dispatcher also retries shape-corrected lists |
| App won't boot after a config edit | restore the `.bak` next to your patch | patch-layer YAML is boot-critical — validate it first |
| Everything worked yesterday | did the app update? | re-run the link step and `smoke.mjs`; the harness is a preview and its APIs move |

### The diagnostic scripts

Two scripts sweep the bridge's whole surface and report per-feature pass/fail. They are the evidence behind the tier model — run them after a harness upgrade, or when you turn a tier on.

```bash
python3 tools/probe.py           # tiers 1–2: every MCP tool, every curated op,
                                 # then a read-only sweep of the live catalog
python3 tools/probe-tier3.py     # tier 3: credentials / account / plugin-manager surfaces
                                 # (values masked at the source; includes one deliberate
                                 # credentials write round-trip on a throwaway key, cleaned up)
```

Both talk to `http://127.0.0.1:8791/mcp` by default — override with `DSH_BRIDGE_URL` if you moved the port.

What they check, in order:

1. **MCP surface** — `tools/list` completes and every tool answers.
2. **Curated ops** — each tier-1 op dispatches, and a deny-listed op (`host.call`) is *refused* (a refusal there is a pass).
3. **Live catalog** — for every mounted service, the first read-only-looking method is called with no arguments (`list`/`get`/`describe`/`status`/…) so nothing mutates. Results are classified as reachable / needs-arguments / not-mounted, with the service's own error text.
4. **Tier 3** (second script) — the authority surfaces, with credential values replaced by `<N chars, masked>` before anything is printed.

Output is a per-feature PASS/FAIL list plus a JSON report. `tools/example-probe-report.json` shows the shape. Reports are written to `tools/` and excluded from git (see `.gitignore`), so running them never dirties the repo.

**Reading the results:** *published ≠ mounted* is normal — the catalog advertises every service the code can provide, while fewer are live in a given composition. The scripts report exactly which, so an "unreachable" line is information, not necessarily a fault.

## Updating the harness

The harness is a developer preview; APIs and session formats change. After an app upgrade:

1. re-do the `pnpm add -w "link:$PLUGIN"` step (a plain install can turn the link into a copy and break package identity),
2. restart the app, run `smoke.mjs`,
3. re-run `tools/probe.py` (and `probe-tier3.py` if tier 3 is on) to re-verify the surface.

The bridge keeps the damage small: all harness-facing calls go through one thin adapter layer, and everything degrades rather than blocks activation.

## Uninstall

Remove the plugin from the profile (deps + `dsh.profile.bundles` + the config row), restart the app, and `hermes mcp remove dsh`. Project registrations left behind are harmless — removing a project never deletes folders, files or session history.

## Known limits

- **Loopback only, by design.** `authToken` exists, but the port should not be exposed off-host.
- **No question answering.** If a task triggers `ask_user_question`, nothing answers it; `taskTimeoutMs` is the guard. Keep tasks self-contained.
- **Published ≠ mounted.** See the probe scripts above.
- **Installed as a link.** Edit the plugin, restart the app to reload.
- **Third-party doc corpus excluded.** `skills/.../references/upstream-docs/` is a local mirror of DeepSeek's own docs; it is not committed (other project's docs, drifts upstream). The skill works without it.

## License

MIT — see `LICENSE`.
