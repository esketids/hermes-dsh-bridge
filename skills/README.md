# skills/

These are the **agent-side** files: the operating skill Hermes loads when it works on this
bridge, plus the references it pulls in.

| Audience | Where |
|---|---|
| a user of the bridge | the root `README.md`, `hermes/README.md`, `plugin/README.md` |
| the agent working on the bridge | this folder |

| File | What it is |
|---|---|
| `deepseek-harness/SKILL.md` | the skill: when to delegate to the harness, the bridge's command surface, the workflow |
| `deepseek-harness/references/desktop-app-bridge-install.md` | install recipe + the pitfalls that cost real debugging time |
| `deepseek-harness/references/hermes-integration-options.md` | why this shape won over the alternatives (headless CLI, JSON-RPC bridge, ACP, MCP-only) |
| `deepseek-harness/references/token-and-cache-economics.md` | what makes cache hits and what destroys them |
| `deepseek-harness/references/package-index.md`, `plugin-map.md`, `plugin-map.json` | the harness package/plugin map |
| `deepseek-harness/references/control-plane-and-interop.md` | the harness's control surfaces and interop seams |
| `deepseek-harness/references/composition-web.txt` | a dump of the composed plugin tree |
| `deepseek-harness/references/upstream-docs-INDEX.md` | index of the local upstream-docs corpus |

## Installing these into Hermes

Copy the skill directory into the skills folder:

```bash
cp -R skills/deepseek-harness ~/.hermes/skills/
```

Hermes picks it up on the next session; `skill_view(name="deepseek-harness")` loads it.

## Two things to know

- **This folder is a mirror, not the live skill.** The authoritative copy is the one installed
  in `~/.hermes/skills/`. Editing the repo copy does not change what the agent loads — re-copy
  after editing.
- **`references/upstream-docs/` is not in the repo.** It is a local mirror of DeepSeek's own
  documentation (another project's docs, constantly drifting). `upstream-docs-INDEX.md` lists
  what a full mirror contains; regenerate it locally if you want it. Everything else here works
  without it.
