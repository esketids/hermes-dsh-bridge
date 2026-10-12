# Control plane: Hermes editing the harness, and re-reading it

Load when the user wants Hermes to manage the harness' projects/workspaces, plugins, or features, or wants to reconcile state after working in the harness' own GUI.

## Who owns what

The workable default is a **one-way control plane from Hermes over durable state**, with the app owning live state:

| Field | Owner | Mechanism |
|---|---|---|
| Projects / repo folders | Hermes | `hermes project` CLI and `~/.hermes/projects.db` |
| Harness workspaces (the sidebar's project list) | Hermes writes, app displays | the workspace controller service, or one click in the app |
| Plugins (add/remove/enable/disable) | Hermes | `dsh plugin --profile <p> …` and the profile's `package.json` bundle list |
| Feature mounts (what a profile composes) | Hermes | the profile's `cordis.patch.yml` rows — a restart applies them |
| Settings (default route, extra providers, permission preset) | Hermes | `~/.dsh/settings.yaml` — hot, no restart |
| Live session activity, approvals answered in the app | the app | read-only for Hermes |

## The hard limit

Hermes controls the **offline** harness; it cannot hot-edit a running app. The Electron profile refuses CLI boot and `--dump-config`, and plugin operations on it work only when the app has been opened once and is then fully quit. There is no exposed control API into a live app process. So the cycle is **quit → edit → relaunch**, and anything switched on inside the app's own UI stays the app's business.

Corollary that shapes every design: **files are the write channel for durable state; an MCP bridge is the only read channel for live state.** The filesystem shows what is persisted, not what is running.

## Harness-side paths and seams

- `~/.dsh/storages/workspace.json` — the workspace registry: a versioned storage unit (`unit: {name, version}`) holding `workspaceIds`, `defaultWorkspaceId`, and a `workspaces` table. A `defaultWorkspaceId` with an empty table just means the user has never pinned a project.
- Sessions are grouped on disk by cwd under `~/.dsh/sessions/<encoded-cwd>/session-<id>/`.
- The workspace controller owns the programmatic write path: create, rename, remove, reorder workspaces, and reorder/archive sessions inside them, plus the directory-picker seam. That is the intended API for adding a workspace — not editing the storage file.
- The workspace-files API is **read/watch only** (no mutation operation), and reads may target paths outside the workspace while listings stay workspace-scoped.
- Do not hand-edit the versioned storage unit while the app is running: it is the app's durable state and a form write refuses to overwrite a higher-precedence layer.

## Workspaces are cheap, disposable groupings

They are an ordered list of project directories plus the sessions that ran in each — **invisible to models, zero prompt/request-context cost**, and removing one deletes no files or sessions. Removing and re-adding a directory creates a fresh project, and sessions whose directory cannot be validated stay ungrouped. **Canonically distinct paths remain separate workspaces**, so normalize with realpath before syncing or the same repo appears twice.

Reading the harness' session logs directly is possible (JSONL, compressed, with a versioned format and shipped migrations) but fragile across releases — use the bridge's mirror channel when one is installed, and treat raw log parsing as a last resort.

## Reconciling after the user works in the app

A reconcile loop, in order:

1. **Snapshot the actual state** — installed version, profiles and their bundle lists, patch rows, settings, plugin inventory, workspace ids, sessions per workspace, and whether the app is running.
2. **Diff against the declared state** — what Hermes last wrote (its project rows plus a small manifest of harness changes it made).
3. **Report the drift** — workspaces added or removed in the app, plugins or features toggled, settings changed, new repos discovered.
4. **Repopulate the Hermes side** — create or update project rows, attach sessions, register missing workspaces through the controller, refresh this skill's notes.
5. **Say what needs a restart** — patch-level changes do not apply to a running harness.

Keep it idempotent and one-way by default: Hermes' declared state wins unless the user says the app changed something.

## Hermes-side triggers for the loop

- **Shell-script hooks** — a hook can run the reconcile script without the agent being asked, which is how the state stays current for free.
- **Cron** — for periodic reconciliation.
- **Skill bundles** — a bundle is invoked as `/<name>` and loads its skills, which is the closest thing to a custom command: name a bundle for the harness and the user gets `/dsh` that loads this skill. There is no user-defined one-shot slash command; the in-session registry is fixed.

When the target is the app rather than `dsh web`, the app's plugins sidebar can install a bundle by spec natively, so a one-click install is a legitimate alternative to a scripted one.
