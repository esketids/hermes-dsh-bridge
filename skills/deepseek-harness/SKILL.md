---
name: deepseek-harness
description: "Drive, configure, and integrate DeepSeek Harness (dsh)."
version: 1.1.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Coding-Agent, DeepSeek, dsh, Harness, Delegation, MCP, Orchestration]
    related_skills: [codex, claude-code, opencode, hermes-agent]
---

# DeepSeek Harness (dsh)

Route coding work from Hermes to DeepSeek's first-party agent harness: Hermes stays the orchestrator (planning, research, other tools), dsh does the file edits and command runs. Peer of the `codex` / `claude-code` / `opencode` delegation skills.

## When to use

- The user asks for coding tasks to be executed by DeepSeek Harness, or wants to *watch* an agent work in the dsh GUI.
- A refactor or parallel coding job whose tool output would flood Hermes' own context.

## Surface map — what each entry point is

| Entry | Form |
|---|---|
| `dsh web` / the desktop app | GUI. The Electron app uses the reserved `desktop` profile, which composes `dsh-base` + `dsh-web-app` — the same stack as `dsh web`, not a separate product. |
| `dsh --profile headless "<task>"` | One task, final answer on stdout, reasoning/diagnostics on stderr, then exit (0 = completed, 1 = aborted/errored). `--json` streams NDJSON run events; `--session-id <id>` resumes a session; the task may also come from stdin. |
| `dsh --profile acp` / `--profile sdk` | Automation protocols over stdio for machine clients (ACP supplies one-shot machine approval decisions for sessions it owns). |
| `dsh plugin --profile <p> <pnpm args>` | Install/remove/inspect a profile's plugins. |
| `dsh --profile <p> --dump-config` | Print the composed plugin tree with per-line source comments — the authority on what a profile actually mounts. `--dump-default-config` omits the user layer. |

No `dsh` binary on PATH is normal for an app-only install. Two fixes, in order: the desktop app's **Manage dsh Command…** menu item installs one (macOS: `/usr/local/bin/dsh`, with Repair and Remove); otherwise `npx --yes @deepseek-ai/dsh@latest …`. Node must satisfy `^22.19.0 || >=24`; check `node -v` before blaming the harness for a failed boot.

## Profiles and config layers — put a setting where it actually lands

- Home is `~/.dsh/` (or `$DSH_HOME`): `profiles/<name>/`, `sessions/`, `storages/`, `.credentials.yaml` (0600), optional `.env`.
- Patch precedence, later wins: each bundle's patch (in `dsh.profile.bundles` order) → `profiles/<p>/cordis.patch.yml` → home `~/.dsh/cordis.patch.yml` → `--patch` overlays.
- **A profile patch is per-profile.** A provider/model configured in `profiles/desktop/cordis.patch.yml` does not give `headless` a model at all — it silently has none. Cross-profile config belongs in the home-level `~/.dsh/cordis.patch.yml`.
- Static vs dynamic: `cordis.patch.yml` is the deployer layer (needs a restart); `~/.dsh/settings.yaml` is hot-published user state and owns the default route (`agent-default-model`), extra providers (`llm-pi-ai.providers`), and `permission.defaultPreset`.
- Credential resolution order: process env → `~/.dsh/.credentials.yaml` → cwd `.env` → `~/.dsh/.env`.
- Profiles that auto-initialize on first use: `web`, `headless`, `sdk`, `sdk-minimal`, `acp`. The invoking directory is the workspace root.

## The fail-closed pitfall — the number one time sink

Headless and other CLI compositions mount **no approval answerer**, and `ask` with no answerer resolves `unavailable`, which is treated as **rejected**. A one-shot run under the factory `workspace-write` + `ask` preset therefore denies its own file writes and reads as "the agent refuses to work" rather than a permissions problem.

The preset table itself is configurable (`presets: {<name>: {sandbox, approval}}` — the reserved names `custom` and `auto` throw if named there, and the plugin requires a confining shell executor to mount at all). Use that to make the harness never prompt **while keeping** the file boundary. Three options, best first:

1. **Configured preset `{sandbox: workspace-write, approval: never}`** plus `permission.defaultPreset: <that name>` in `~/.dsh/settings.yaml`. No prompt ever fires and writes stay confined to the workspace — the right shape when the user wants authorization to live in Hermes and nowhere else. The table lives in the profile patch (restart); only the default is hot.
2. **Per process, unattended:** `DSH_PERMISSION_MODE=danger-full-access`. The env var is read as the sandbox-mode fallback in the composed tree and derives `never` for the approval policy — but it drops confinement to full access, and it **cannot** express `workspace-write` + `never`, because it derives `never` only from `danger-full-access`.
3. **Global default for new sessions:** `permission.defaultPreset: danger-full-access` in `~/.dsh/settings.yaml` — this also loosens the desktop app, so do not reach for it first.

Authorization placement is **cache-neutral** by design: the approval service is append-only across an `ask`↔`never` switch, and a sandbox-mode change appends a context snapshot after retained history instead of rewriting the prefix. Moving every decision to Hermes therefore costs no cache hits.

Mechanics worth knowing before promising behaviour: the permission choice is pinned into a session at creation (later default changes never alter existing sessions, and a resumed session keeps its own); answers are one-shot (`allowed-once`), with no allow-always and no authorization store; `custom` is a derived display state, never a switch target; and permission is *not* the sandbox — the preset picks a mode, the sandbox enforces the file boundary, which confines writes but **not reads**.

## Delegating from Hermes — pick the shape

Two standing constraints for this user's harness work, applied before weighing anything else:

- **Authorizations are answered by Hermes, never by the harness UI.** Configure the harness so nothing prompts (see the fail-closed section) and treat the dispatch decision plus the cwd it names as the authorization.
- **Token spend and cache-hit rate rank the options.** A shape that keeps a warm, reused session beats one that re-boots per call even when the latter looks simpler to wire. Full rule set and levers: `references/token-and-cache-economics.md`.

Decision table, bridge catalogue, and wiring notes: `references/hermes-integration-options.md`. Summary — one-shot CLI is the honest first proof; an MCP bridge mounted inside the harness is what actually pays off (agent session reuse per cwd instead of re-loading a ~7.5k-token system prompt on every call); ACP/SDK profiles are for machine clients.

Control plane and interoperability — Hermes editing the harness' workspaces, plugins, and features, then re-reading what changed in the app: `references/control-plane-and-interop.md`.

When the user asks whether something is **possible** rather than asking for it, answer with the verdict, the mechanism, and the blocker, and make no changes. A feasibility question is not a go-ahead, and starting to implement under one earns a correction.

## Pitfalls

- **Verify by inspecting the workspace, not the exit code.** A run can complete its work and still exit nonzero on its own timeout cap. Check `git diff`, run the tests, read the session log.
- **Model choice dominates harness behaviour.** The identical task ranges from ~40s to never-finishing across backends, and an incompatible OpenAI-compatible endpoint can return empty responses in about a second with no error and no log entry — if a backend "does nothing", suspect the endpoint pairing before the model.
- **Headless mounts fewer plugins than the GUI.** No storage-domain, so memory tools answer `MEMORY_DISABLED`; no approval answerer. Work needing memory or a human in the loop belongs on the web/desktop profile.
- **The `desktop` profile is Electron-owned.** The CLI refuses to boot or `--dump-config` it, but `dsh plugin --profile desktop …` does work under a file lock, provided the app has been opened once and is then **fully quit**; the app's own Plugins sidebar can also install a bundle natively.
- **The desktop app's port is OS-assigned by default.** It binds `127.0.0.1` on a random port, so any recipe that hard-codes `3080` — every bridge README does — points at the wrong process when the target is the app. Pin it with a `webserver.config.port` row in the desktop profile's patch, or target `dsh web` instead.
- **The app shares `$DSH_HOME` but not its plugin tree.** Sessions, settings, credentials, workspaces, and storage are shared with the CLI; executable packages, plugin activation, and lockfiles are separate — so a plugin installed for `web` is not mounted in `desktop`. Mount where you actually run.
- **Token appetite on long tasks.** Small tasks are cheap; a single long generation can burn millions of cache-read tokens. Cap run time and prefer resumable sessions over re-running.
- **This is a developer preview with breaking interface changes** (session-log format migrations, plugin API removals). Pin the version you validate against, and re-check flags against the shipped package after an update.
- **Never let a generic dispatcher invent arguments for a write.** A credential/authority surface (`credentials`, `credentialsController`, `deepseekAccount`, `authorization`, `pluginManager`, `configEditor`) must only ever be written to with explicit, signature-validated arguments — a reference must satisfy the harness' own identifier grammar, and an empty or placeholder value must be refused rather than passed through — because a `{}` reference that reaches `credentials.set` persists a document the next boot rejects, and the failure that surfaces is "a required plugin did not activate", not "an argument was wrong"; reads on those surfaces are unaffected, and a method taking one request-shaped parameter must still receive its object (only a named object whose keys exactly match the published parameter names may be mapped to positional order). The persisted junk looks like:
  ```yaml
  refs:
    ? {}
    : {}
  ```
- **A startup failure is a config parse error far more often than a damaged install.** The startup dialog names a diagnostic report at `~/Library/Logs/DeepSeek Harness/crash-<ts>-host.log` and tells you to reinstall — the log is the authority and the advice is not: read it first (it carries `phase: startup` plus the failing plugin, or a `failed to parse overlay …: YAMLException` for a malformed profile patch), and note that the recoverable state all lives under `$DSH_HOME` / `~/.dsh/profiles/`, never in the app bundle; localise the fix to the named file, preserve every other entry, and keep a fallback copy — repairing by hand beats reinstalling.

## Verified vs unverified — say which one you are claiming

Verified by reading the shipped packages, docs, and composed config: the CLI surface above, the layer/profile layout, fail-closed approval semantics and the `DSH_PERMISSION_MODE` escape, the desktop-profile CLI restrictions, and the plugin inventory.

Not verified end-to-end: an actual headless task run against a configured provider, and whether agents created by a bridge plugin render as first-class sessions in the GUI sidebar. Prove either with a trivial task in a throwaway directory before telling the user it works.
