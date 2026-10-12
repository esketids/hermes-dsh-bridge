# Driving the DSH desktop app from Hermes (verified recipe)

Goal: Hermes orchestrates, the **desktop app** executes coding work, authorisation lives on Hermes.
One-way MCP: Hermes is the client, a plugin inside the app is the server.

## Why not the CLI

`dsh --profile headless` re-creates the agent per invocation: the whole project context is an
uncached prefix every call, and the system prompt (~7.5k tokens) is re-sent. A *resident*
session inside the app reuses the prefix — the community's own figure is 15-20x cheaper. The
app also mounts more plugins than headless (storage-domain/memory, approval UI, sidebar).

## Hard constraints discovered by doing it

1. **The CLI refuses the desktop profile.** `dsh plugin --profile desktop ...` exits with
   `error: profile "desktop" is managed exclusively by the Electron application` (guard in
   `apps/cli` `bin.js`). The app's own Plugins sidebar is the sanctioned installer for that
   profile, so scripted installs must reproduce what `dsh plugin add` does by hand.
2. **`open -a` is not a reload.** The composed profile tree is read once at boot; the app must
   be **fully quit** and relaunched for a patch change to take effect.
3. **Profile patch files are all-or-nothing at boot.** One malformed line (e.g. an appended
   comment whose leading `#` was lost) aborts the boot with
   `dsh: failed to parse overlay ... YAMLException`. The app then shows its crash dialog,
   writes `cordis.patch.yml.bak-<stamp>` beside the file, resets the live file and continues —
   the user's original rows are recoverable from that backup. Always rewrite patch files with
   a YAML library and re-parse before relaunching.
4. **Bare `@deepseek-ai/*` imports do NOT resolve from the profile dir** (verified:
   `ERR_MODULE_NOT_FOUND` even under the app's own runtime). The sanctioned fix is the harness'
   own bundle rule: declare them under **`peerDependencies`** — "at that manifest's lookup
   position, peers present in the running dsh's runtime resolution use the installation's copy".
   This is also what avoids the *dual-package hazard* (a second copy of the packages breaks
   `Symbol` identity, agent preset mounting is silently skipped, and the agent answers with no
   tool calls).
5. **A bundle is the unit of install.** `package.json` needs
   `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`, and that patch's rows reference the
   package **by name** (`name: <pkg-name>`) so Node resolution finds the installed code.

## Install (desktop profile, scripted)

```sh
PLUGIN=/abs/path/to/plugin; P="$HOME/.dsh/profiles/desktop"
cd "$P" && pnpm add -w "link:$PLUGIN"          # any pnpm; the app ships one under
                                              # Resources/runtime/primary-runtime/dependencies/pnpm
# register the bundle in the profile manifest
python3 - "$P/package.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
d.setdefault("dependencies",{}).setdefault("<pkg-name>","link:/abs/path/to/plugin")
d.setdefault("dsh",{}).setdefault("profile",{}).setdefault("bundles",[]).append("<pkg-name>")
json.dump(d,open(sys.argv[1],"w"),indent=2)
PY
# fully quit + relaunch, then probe the plugin's own health endpoint
```

`dsh plugin --profile desktop add <path>` is the same end state when it is reachable (the
app's own CLI, installed from its "Manage dsh Command..." menu, or a version whose launcher
allows it).

## Talking to the app process

### Let the app publish its own surface (the future-proofing move)

The app ships an inspection registry (`ctx.inject(['cordisInspect'], …)`; supplied by
`@deepseek-ai/dsh-cordis-host-runner`, consumed by Creator mode's `dsh-tool-cordis`). Call it
**positionally** — `query(platform, providerId, methodName, input, agent, signal)` — and note the
implementation touches `signal.throwIfAborted()`, so a real `AbortSignal` is required. Providers:
`Service`, `Event`, `Config` (and per-platform client variants).

- `Service` + `listService` with no input → catalog:
  `{mode:'catalog', services:[{key, description, methods:[…]}]}`
- `Service` + `listService` with `{service:'<key>'}` → that service's exact contract:
  `access.optional.expression` (`ctx.get("x")`, `requiresUndefinedCheck`) vs
  `access.hardDependency.inject`, plus each method's `@Remote('…') name(args): Return` signature.

Method entries carry **only `signature`** (no `name`), so derive the callable name from it —
`@Remote('x') x(...)` wins, else the identifier before `(`. Calling with the wrong shape gives
`Client Cordis inspect provider "undefined" is not registered`, which just means the positional
signature was not followed.

With that catalog cached, a bridge can expose *any* host service method as
`{group:<serviceKey>, op:<methodName>, args}` and validate typos against the live list before
calling — that is what makes new harness features reachable with no bridge change.

### Tiers, because discovery ≠ exposure

Gate generically-dispatched methods: curated ops tier 1, **every catalog method tier 2** (the
catalog has no read/write metadata, so a generic call must be treated as mutation-capable), and
authority/credential/install services (`credentials`, `deepseekAccount`, `authorization`,
`pluginManager`, `configEditor`, telemetry) tier 3 behind a separate flag. `denyOps` beats both
tiers; `allowOps` lifts a single op out of a disabled tier. Audit every dispatch in a ring buffer
and expose it, so "what did the bridge actually do" is answerable without log archaeology.

### Catalog is published classes; mounted is what is live

`listService` enumerates the registry's service *classes* (91 in the desktop app); the live set is
smaller (44). Report the difference explicitly (`mountedServices` from the inject callbacks) instead
of letting "unreachable" look like a bridge defect. Services absent from a composition simply never
fire their `ctx.inject` callback — listing ~55 optional names at apply time is free and converts
"not reachable" into "reachable" wherever the service does exist.

### Automatic argument filling: candidates, not guesses

Many host methods declare runtime parameters (agent, signal, session) or require real domain data.
Build an ordered candidate list and try each until one stops throwing:

1. the caller's arguments as given
2. the signature's declared parameter list filled from *names* (signal→`AbortController().signal`,
   agent/session→a pooled live agent) — this **replaces** the caller's args, which is required when
   the first parameter is the runtime one (`listSessions(signal?: AbortSignal)`)
3. caller args + the signature-declared tail
4. caller args + `[agent, signal]`, then + `[signal]`

Two traps: dedupe candidates by internal class tag (`Object.prototype.toString.call(v)`), because
`typeof` reports both an AbortSignal and a plain object as `"object"` and will discard the one
candidate that works; and only ever fill handles you already hold — inventing domain data (ids,
refs, iterables) turns a clear "Attachment reference is invalid" into a mystery.


### Tier 3, verified (authority / credential / install surfaces)

With `enableTier3: true` the credential and account surfaces answer read calls:
`credentials.listRecords` / `.describe` / `.readRecord`, `pluginManager.listPlugins` /
`.listBundles` / `.listVersionExemptions`, `authorization.list` (the auth providers),
`configEditor.entries` / `.configuration`, `deepseekAccount.getState` / `.getPlatformSession` /
`.getDeviceIdentity`. A credentials round-trip (`set` then `unset` on a throwaway key) works, which
is the proof the write path is real — never exercise it on a live key.

Three shapes stay out of reach, and that is expected rather than broken:
`credentialsController.describe` wants a payload type the catalog does not describe;
`deepseekAccount.getProfile` / `.getBalance` / `.getUnnotifiedBonuses` dereference a missing
argument; streaming methods (`watch`, `follow`) return feeds, not values.

**Mask secrets in anything you print.** Credential records come back as `{key, kind}` with an opaque
`key`; mask by field name (`key|token|secret|password|credential`) *and* by length — a long opaque
string under an innocent name is still a secret.

**Services that publish no methods** (`credentials`, `deepseekAccount`, `pluginManager`,
`credentialsController` all report `methods: 0` in the catalog) are still callable: fall back to the
live object's own method names (`Object.getOwnPropertyNames` up the prototype chain, filtering
`constructor`/`_`-prefixed) and validate against those. The catalog is a description, not the only
truth.

Resources (an HTTP listener, a subscription) go in `ctx.effect(() => { …; return dispose })` — the
harness' documented seam. `ctx.on('dispose', …)` leaves the socket bound across a plugin reload,
so the next start fails with EADDRINUSE.

Verified end-to-end on 0.2.0-rc.2 ("hello from the harness" written and run by an agent in the app):
warm-session cache behaviour is exactly as advertised — first call 7,571 uncached input tokens,
second call on the same resident session **416 uncached / 14,592 cache-read = 97.2% hit**.

The bridge lives **in** the app and needs no host port: it starts its own loopback HTTP server
(the app's own server binds an OS-assigned random port by default, so never rely on 3080).
Hermes registers it as an HTTP MCP server:

```yaml
mcp_servers:
  dsh:
    url: "http://127.0.0.1:8791/mcp"
    timeout: 2700   # coding turns are long; keep it well above the plugin's taskTimeoutMs
```

## Wiring agent work from inside a plugin

Verified API surface (0.2.0-rc.2, from shipped packages and working community plugins):

- `ctx.agents.create({ sessionId, meta: { cwd }, agentOptions: { provider, model, reasoningEffort, maxTokens }, setup })`
  and `ctx.agents.resume({ resumeSessionId, agentOptions, setup })`; `ctx.agents.get(id)` finds an
  agent that is **live in the app window** (a session the user opened by hand).
- `handle.agent.followup(createUserMessage({ content: [{type:'text',text}], source:{kind:'<your-plugin-id>'} }))`
  then `await handle.agent.whenIdle()` — `createUserMessage` comes from `@deepseek-ai/dsh-llm`.
  **Session format v4 refuses `{kind:'plugin', plugin:…}`** (`format v4 message requires a producer-owned
  source kind`): a durable message must carry its producer's own kind, so use your plugin id (the shipped
  webhook row uses `kind: 'webhook'`). A rejected message surfaces only as a `turn/end` whose
  `reason.kind === 'error'` — zero tokens, zero steps, no exception anywhere.
- **Cordis guards `ctx` property access**: reading a service that is not in `inject` throws
  (`cannot get property "sessionTitle" without inject`). Inject every service you touch, including
  cosmetic ones (`sessionTitle`), and keep optional ones behind try/catch.
- The **agent preset** (tool composition) is mounted in `setup`: `ctx.agentPresets.mount(agentCtx, preset)`.
  Guard on `scopeOf(agentCtx) !== undefined` (`@deepseek-ai/dsh-scope`); an unscoped context means
  the mount throws and you must degrade rather than crash.
- **Sidebar grouping**: `ctx.workspaceRegistry.resolveByPath(canonicalCwd) ?? ctx.workspaceRegistry.create(canonicalCwd)`,
  then `ws.attachSession(sessionId)`. `attachSession` validates that `realpath(header.cwd)` equals the
  workspace path, so canonicalise before creating the agent.
- **Project (workspace) management from a plugin.** The registry answers `list()`, `resolveByPath(path)`,
  `create(path, title?)` and `delete(id)` for registrations; the *public* write path is the Host service
  `ctx.workspaceController`, whose methods take request objects — `create`, `rename({ workspaceId, title })`,
  `delete({ workspaceId })` — and it publishes an upsert/remove/order/archived/pinned feed for clients.
  Reach an optional service with **dynamic injection** rather than the static `inject` list
  (`ctx.inject(['workspaceController'], (c) => { … })`, as `dsh-permission-presets` does for
  `sessionProjections`): a missing service then degrades instead of blocking activation. Deleting a
  project never touches its directory, files or session logs.
- **Stats**: fold the agent's session log (`handle.agent.session.log`). Count `turn/end`, `step/end`,
  `tool/call`; take `data.usage.{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}` from
  `assistant/message`. `cacheHitRate = cacheRead / (input + cacheRead + cacheWrite)` (or `/ input`
  when cacheRead <= input). DeepSeek's cache metrics are mapped into harness usage.

## Authorization on Hermes' side

Pin the knobs at session creation instead of letting the harness ask:
`ctx.permissionPresets.set(session, '<preset-name>')` needs the preset to exist in the profile's
permission row (`sandbox: workspace-write`, `approval: never`); the fallback path is the raw knob
setters the preset service itself uses — `ctx.sandboxPolicy.setSandboxMode(session, 'workspace-write')`
and `ctx.approval.setPolicy(agent, 'never')`. Both leave `defaultPreset` alone so hand-opened app
sessions keep their confirmation prompts.

## Cost rules that actually move the number

Measured on one 14k-line repo, three comparable tasks per arm, `reasoningEffort: low`
(arm totals, DeepSeek peak rates):

| | uncached in | cache read | output | hit rate | cost |
|---|---|---|---|---|---|
| fresh session per task | 96,026 | 470,528 | 10,424 | 83.1% | $0.0441 |
| one resident session | 47,863 | 553,216 | 6,880 | **92.0%** | **$0.0259** |

The warm arm was **1.7x cheaper**, and the gap widens with task cohesion — the third task,
appended to a session that already held the repo, ran at **98.4% cache hit** (4.1k uncached
in vs 248k cache read). Two honest caveats from the same data: (a) even a session-per-task
integration already gets ~80% hits, because a multi-step turn re-sends the same prefix and
the static instruction+tool prefix is shared across sessions at the provider; (b) a good part
of the warm win is **not** cache at all — the fresh sessions spent 33 tool calls and 10.4k
output tokens against 25 and 6.9k, i.e. they re-explored what the warm session already knew,
and output is 4x the price of a cache miss per token. So the reason to keep sessions warm is
"stop paying to re-learn the repo", with cache reuse as the multiplier.

- `reasoningEffort` defaults to **`high`** in the deepseek adapter; a heavy run can be 123k of
  172k output tokens in reasoning. Set `low`/`off` for routine edits.
- Pin one route per session: switching model/provider "selects a different cache domain" (full miss).
- Never change the tool roster mid-project (tool-schema changes invalidate the prefix from the
  first altered token); install plugins between projects.
- Prefer the pruner + spill (`dsh-compaction-tool-result-pruner`, `dsh-spill-policy.maxInlineTokens`)
  over summarisation compaction, which costs one extra model request *and* invalidates reuse from
  the first replaced token.
- Fork subagents inherit the parent's byte-identical prefix; spawned children start their own.

## Widening the surface later (why a bridge can stay update-proof)

Two seams make "expose more of the harness" a generation problem rather than a rewrite:

- **The harness' own tool registry is introspectable**: `ctx.tools` (from `@deepseek-ai/dsh-tools`)
  answers `entries()`, `get()`, `view()`, `describe()`, `restrict()` and `register()`, so a bridge can
  list the tools registered *at runtime* instead of hardcoding names. Caveat: the documented
  dispatcher for those tools is the agent loop, so direct invocation from a plugin is not
  guaranteed — the safe fallback is to route the work through a session.
- **The GUI's own actions are Host controllers with generated declarations.** Across the
  `@deepseek-ai/dsh-api-*` packages, `lib/typert.host.js` declares every Remote method with its
  signature and jsDoc: 61 methods in 0.2.0-rc.2 (session 22, workspace 14, terminal 10,
  settings 7, workspace-files 5, jobs 3). They are the same methods the browser client calls, so a
  plugin in the host can call them too — directly (as with `workspaceController`) or through the
  Remote gateway. Prefer *generating* a command surface from those declarations over hand-writing
  tools: it re-derives itself when the harness changes, so an update is a re-test, not a rewrite.
  Keep it behind a group allowlist — the set includes terminal, settings and account-adjacent
  surfaces. Precedent inside the product: **Creator mode** pairs read-only runtime-inspection tools
  with the Plugin Manager, which owns persistent changes.
- **HMR is off in the desktop profile by default** (verified: editing the plugin source did not
  change the running plugin's reported version, and no `hmr` row exists in the patch). Enable source
  watching with `- id: hmr` / `disabled: false` / `config: {root: ["<plugin dir>"]}`. Trade-off: a
  reload can change request prefixes, i.e. it discards provider cache — develop with it on, don't
  leave it on during real work. Without it the loop is edit → quit app → relaunch (~15s).
- Client-only surfaces (theme, layout, scroll) and the deliberate human seams (approval prompts,
  quit-with-running-tasks, permission escalation) have no command equivalent; treating them as
  convertible means choosing to bypass a safety design.
