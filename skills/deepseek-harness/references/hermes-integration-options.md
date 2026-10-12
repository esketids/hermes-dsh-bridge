# Wiring Hermes to DeepSeek Harness

Depth for the "which shape do I use" decision. Load when the user asks how to connect the two, or when a delegation must survive more than a single call.

## The three shapes

| Shape | Mechanism | Gains | Costs |
|---|---|---|---|
| One-shot CLI | Hermes runs `dsh --profile headless "task"` with the repo as cwd | Nothing to install; one exit code and one final answer; no ports, nothing left running | Agent re-boots per call (system prompt + context reload); no interactive follow-up; no approval answerer → fail-closed writes (see SKILL.md) |
| MCP bridge | Hermes is the MCP client; a plugin mounted *inside* the target profile starts an MCP server that bridges `ctx.agents` / `ctx.tools` | Session reuse per cwd (roughly 15–20× cheaper than one-shot on repeat calls); Hermes can answer the harness' approval requests; tasks can be queued and polled | Third-party plugin living in the harness process; needs the harness running; unauthenticated RCE if bound off loopback |
| ACP / SDK profiles | `dsh --profile acp` / `--profile sdk` speak automation protocols over stdio | Machine-native approval decisions, no human needed for unattended runs | Whether Hermes can act as an ACP/SDK *client* is unverified — Hermes ships an ACP **server** for IDEs, which is the opposite direction |

Hermes-side wiring for a bridge: `hermes mcp add <name> --url http://127.0.0.1:<port>/mcp`. Bind loopback only, and add the plugin's token option before any non-local exposure.

## What third-party bridges expose

- **MCP server inside the harness** (`agent_run`, `task_inbox`, `task_result`, plus tool listing and a connectivity echo). The stated use case is context isolation for huge refactors and parallel unrelated tasks; its own docs call it a fallback rather than a daily driver. Sandboxed bash needs `bubblewrap` on the host or write commands are refused.
- **Richer bridges** add `approval_list` / `approval_respond` (Hermes answers escalation prompts; a timeout resolves to cancel/deny and **never** auto-approves), `set_policy` / `policy_get` for the sandbox mode, session stats, session search/rename/attach, and opt-in fs read/write jailed to a workspace root.
- **Reverse direction:** some bridges import and resume Hermes sessions as native harness sessions in the sidebar, inject a persona/system prompt, and mirror sessions back out. Pick this when the goal is "I want to jump into the app and continue by hand", not "Hermes dispatches work".

## Wiring facts that break a bridge on first try

- The bridge plugin must be mounted in the profile you actually run — mounting it in `web` does nothing for the `desktop` app profile, and vice versa.
- Declare the provider/model explicitly in the bridge config: agent assembly crashes on an empty `{{model}}` when the profile has no route.
- Install with the harness **fully stopped** when the target is the Electron `desktop` profile (open it once first, then quit, then `dsh plugin --profile desktop add …`); otherwise the profile write lock and the running app fight.
- Mounting an MCP server *into* a Cordis profile is a profile patch (`cordis.patch.yml`) like any other plugin, and needs a restart rather than a hot reload.
- Sessions created through `ctx.agents` are the harness' own session records, and the GUI session list merges live and persisted sessions — which is why "the task shows up in the app" is plausible, but confirm it with a smoke task instead of asserting it.

## Smoke test before promising anything

Pick a throwaway directory, dispatch a task whose success is trivially checkable (*"write hello.py that prints hello and run it"*), and confirm three things separately: the call returned, the file exists on disk (not just in the answer text), and the run is visible where the user expects to watch it. Report those three results individually — a returned answer is not evidence the workspace changed.

## Vetting a third-party bridge before adopting it

- **Require a real MCP handshake.** A "bridge" whose documentation shows only custom JSON-RPC methods and never a `tools/list` result with the tool set is not an MCP server; registering its URL under `mcp_servers` may not survive the handshake. Ask for the tool list before wiring it in.
- **Read the commit log, not the banner.** A README's version line routinely lags the actual commits by many releases, and a star count says nothing about freshness. Compare recency against the harness version actually installed.
- **Prefer the bridge that ships a self-check plus an explicit compatibility statement,** and one that bridges approvals. Approvals are what make the GUI path unattended; the self-check is what catches the silent failure mode where a stale dependency symlink makes preset mounting skip and the agent answers with no tool calls at all. Note that a fresh harness upgrade can break that symlink again.
- **Expect churn.** These plugins have replaced their own predecessors and archived older designs. Pin the version you validated and re-check after a harness upgrade.
