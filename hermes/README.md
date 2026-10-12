# The Hermes half

The bridge is two halves with one contract between them:

| Half | Where it lives | What it does |
|---|---|---|
| **DSH side** (`../plugin/`) | inside the DeepSeek Harness desktop app | serves MCP on loopback, creates and drives harness sessions |
| **Hermes side** (this folder) | Hermes' own config | one MCP server registration — Hermes is the client |

There is no code to install on the Hermes side. All that's needed is for Hermes to know the bridge's endpoint.

## Register it

```bash
hermes mcp add dsh --url http://127.0.0.1:8791/mcp --connect-timeout 30
hermes config set mcp_servers.dsh.timeout 2700      # long coding turns need a generous ceiling
```

Or merge `mcp-config.yaml` from this folder into `~/.hermes/config.yaml` by hand:

```yaml
mcp_servers:
  dsh:
    url: http://127.0.0.1:8791/mcp
    connect_timeout: 30
    timeout: 2700
    enabled: true
```

The URL must match the plugin's `port` (default `8791`) — if you change one, change the other.

## Load the tools

Hermes fetches `tools/list` when a session starts, so a freshly added server is not visible until then:

```
/reload-mcp          # in an existing session
```

or just start a new session. Check registration with `hermes mcp list`.

## What appears

Eleven tools, namespaced `mcp_dsh_*`:

`dsh_run`, `dsh_sessions`, `dsh_stats`, `dsh_workspaces`, `dsh_workspace_add`, `dsh_workspace_remove`, `dsh_commands`, `dsh_cmd`, `dsh_health`, `dsh_debug` — see the root `README.md` for what each does.

The growing surface deliberately lives *inside* `dsh_cmd`, so adding capability on the harness side never changes this list and never needs a Hermes reload.

## Prerequisites and gotchas

- **The DSH desktop app must be running.** The endpoint is served from the app's process; when the app quits, the tools fail to connect. This is not a daemon.
- **Loopback only.** The plugin has an optional `authToken`; do not expose the port off-host.
- **Long tasks.** `timeout: 2700` covers multi-minute coding turns. Lower timeouts surface as transport errors while the harness is still working.
- **No reverse channel.** Hermes calls the harness; the harness cannot call Hermes' tools. That is by design.

## Uninstall

```bash
hermes mcp remove dsh
```

Nothing else on the Hermes side was touched — the server registration is the whole footprint.
