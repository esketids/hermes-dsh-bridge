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

## What's in the box

| Path | What it is |
|---|---|
| `plugin/` | the bridge: `index.js` (zero dependencies), `package.json` (bundle manifest), `cordis.patch.yml` (bundled defaults), `smoke.mjs` (standalone verifier), `bench.mjs` (cost experiment), `README.md` (technical detail) |
| `skills/deepseek-harness/` | the Hermes skill + references: install recipe, architecture options, token/cache economics, package map |
| `tools/` | `probe.py` / `probe-tier3.py` and their reports — the evidence used to verify the surface |

## Quickstart

**Prerequisites**: the DeepSeek Harness **desktop app** installed and opened at least once (macOS/Windows/Linux), Node ≥ 20, and Hermes Agent.

### 1. Install the plugin into the app's profile

The app owns its `desktop` profile, and the `dsh` CLI refuses to manage it. Do the three edits by hand (or script them):

```bash
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PLUGIN="$(pwd)/plugin"

# a) register the plugin as a link dependency of the profile
cd "$DSH_HOME/profiles/desktop"
pnpm add -w "link:$PLUGIN"          # writes node_modules/dsh-hermes-thin -> your plugin dir

# b) add it to the profile's bundle list
#    (package.json -> "dsh": { "profile": { "bundles": [ ... "dsh-hermes-thin" ] } })

# c) add the config row to profiles/desktop/cordis.patch.yml
```

The row to add (also shipped as `plugin/cordis.patch.yml`, which is the bundle-level default — a row with the same `id` in your **profile** patch overrides it):

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

**Then fully quit and reopen the app** — patch changes load at boot. Check it came up:

```bash
curl -s http://127.0.0.1:8791/health
```

### 2. Give it a model and a key

The bridge inherits the harness's credentials. Put your key where the harness keeps them — **never in a patch file**:

```yaml
# ~/.dsh/.credentials.yaml   (or export it in the environment)
OPENROUTER_API_KEY: <your key>
```

Any provider the harness serves works; point `provider`/`model` at one of them. `reasoningEffort` defaults to `medium` — it is the single biggest line on a token bill, so lower it for routine edits if you care about spend.

### 3. Register with Hermes and verify

```bash
hermes mcp add dsh --url http://127.0.0.1:8791/mcp --connect-timeout 30
hermes config set mcp_servers.dsh.timeout 2700     # long coding turns

cd plugin && node smoke.mjs            # handshake + tools/list + health
node smoke.mjs --run /path/to/repo     # a real tiny task, end to end
```

MCP tools are discovered when a Hermes session starts, so run `/reload-mcp` (or start a new session) after adding the server.

## What Hermes gets

Eleven MCP tools. The important ones:

| Tool | Purpose |
|---|---|
| `dsh_run` | run a coding task in a repo (reuses the resident session) |
| `dsh_sessions` / `dsh_stats` | warm sessions; token and cache-hit figures |
| `dsh_workspaces` / `dsh_workspace_add` / `dsh_workspace_remove` | the app's project list (registration only — never touches files) |
| `dsh_commands` / `dsh_cmd` | the **self-describing command registry**: describe what's callable, dispatch it |
| `dsh_health` / `dsh_debug` | route, presets, tiers, live event stream |

Through `dsh_cmd`, the bridge also exposes the harness's **own live service catalog**: ask `harness.catalog` what exists and dispatch any method as `{group: <service>, op: <method>, args}`. New harness capability becomes reachable without touching either side.

**Tiers** gate exposure: `1` = curated read/dispatch ops (default), `2` = the live catalog including mutations, `3` = credentials, account and plugin-install surfaces. `allowOps`/`denyOps` override tiers in either direction — a deny always wins.

## Using it from Hermes

```
"Use the harness to add a health endpoint to the API and run the tests"
"Have the harness summarise what changed in this repo today"
"List the harness's projects"                     → dsh_workspaces
"What can the harness do right now?"              → dsh_commands / harness.catalog
"Show token spend and cache hits for the last session"  → dsh_stats
```

## Diagnostics

Start here whenever something looks wrong.

```bash
curl -s http://127.0.0.1:8791/health     # is the bridge up?
```

| Symptom | Check | Meaning |
|---|---|---|
| Hermes doesn't see the tools | run `/reload-mcp`; then `hermes mcp list` | `tools/list` is fetched at session start — a new tool needs a reload |
| `/health` refuses to connect | is the DSH **app** running? | the bridge lives in the app's process; it is not a daemon |
| Tools work but the agent returns text and does nothing | `dsh_debug` → check the `turn/end` reason | the silent-message class of failure; the session log says why |
| An op returns *"tier N required"* | `dsh_commands` (shows tiers + what's callable) | working as designed — flip the flag in the config row and restart the app |
| *"service X is not reachable in this composition"* | `harness.catalog` | the catalog lists every service the code *can* publish; fewer are actually mounted |
| *"unknown method"* | `harness.inspect {input:{service:"X"}}` | the dispatcher validates names against the live catalog — typos cost nothing |
| Odd argument errors | `harness.inspect` → read the published signature | pass arguments matching it; the dispatcher also retries shape-corrected argument lists |
| The app won't boot after a config edit | restore the `.bak` file next to your patch | patch-layer YAML is boot-critical — validate before restarting |
| Everything worked yesterday | app updated? | re-run the link step and `smoke.mjs`; the harness is a preview and its APIs move |

Runtime logs and the audit ring: `dsh_debug` (bridge), and the app's own session logs under `$DSH_HOME/sessions/`.

## Updating the harness

The harness is a developer preview; APIs and session formats change. After an app upgrade:

1. re-do the `pnpm add -w "link:$PLUGIN"` step (a plain install can turn the link into a copy and break package identity),
2. restart the app, run `smoke.mjs`,
3. re-run `tools/probe.py` if you use the live-catalog tier — it re-verifies reachability and reports what moved.

The bridge keeps the damage small: all harness-facing calls go through one thin adapter layer, and everything degrades rather than blocks activation.

## Uninstall

Remove the plugin directory from the profile, drop the row from `profiles/desktop/cordis.patch.yml`, remove `dsh-hermes-thin` from the profile's `package.json` (dependencies + `dsh.profile.bundles`), restart the app, and `hermes mcp remove dsh`. Leaving the project registrations behind is harmless — removing a project never deletes folders, files or session history.

## Known limits

- **Loopback only, by design.** The bridge has an optional `authToken`, but it should not be exposed off-host.
- **No question answering.** If a task triggers `ask_user_question`, nothing answers it; the per-task timeout is the guard. Keep tasks self-contained.
- **Published ≠ mounted.** The catalog advertises classes; the live composition mounts a subset. Both are reportable (`harness.catalog`, `harness.services`).
- **Installed as a link.** Edit the plugin and restart the app to reload it.
- **Third-party doc mirror excluded.** `skills/.../references/upstream-docs/` is generated locally, not committed.

## License

MIT — see `LICENSE`.
