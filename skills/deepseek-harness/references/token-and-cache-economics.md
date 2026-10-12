# Token spend and cache-hit rate in the harness

Load when the user asks which integration shape, session model, or settings to use for cost reasons, or when spend looks wrong.

## Read the harness' own cache documentation first

Nearly every shipped package carries a **"KV Cache effect"** section stating whether it appends (reusable) or invalidates from the first changed token, and what it costs. Read them from the installed packages rather than reasoning from first principles — grep the package directory under the dsh install (or the `@deepseek-ai/*` tree in the app's `app.asar.unpacked`) for that heading.

The governing rule from the agent-loop package: **prefix reuse requires earlier messages and declarations to stay byte-identical under the same provider and model route.** Anything that rewrites earlier history ends reuse from the first changed token; anything that appends after the reusable prefix does not.

## Cache-hostile — each one costs a prefix re-miss

| Trigger | Mechanism |
|---|---|
| Switching model / provider route mid-session | Provider-side cache identity changes; the prompt prefix is untouched but reuse is lost |
| Entering or leaving plan mode | The `plan:policy` system-prompt section changes from first-party order 500 onward |
| History compaction | Replacing rather than appending — invalidates from the first replaced token, **and spends one extra model request** for the summary |
| Installing/uninstalling/enabling a plugin, HMR reload, MCP tool re-sync | Tool declarations change, so reuse ends at the first changed schema token |
| Attachments (images) | Each addition invalidates the affected request suffix |
| A `replace` operation on session surface entries | Invalidates from the first shadowed message even though the event log stays append-only |

Auto model routing (flash↔pro) is the cheapest way to lose the cache on every switch — pin one model for the life of a session.

## Append-only — safe to change mid-session

Approval policy (`ask`↔`never`), sandbox mode (a change appends a superseding context snapshot after retained history), time context, skills catalogue and skill bodies, steering, tool results, checkpoint repair, hook-injected content, and durable session persistence. This is why moving authorization to Hermes and flipping permission modes is free.

## Relieving context pressure without paying for it

- **The tool-result pruner** replaces over-budget text with head + "middle pruned" + tail and **makes no model call** — often enough pressure relief to skip summarization entirely, and the full original stays in the session log.
- **Spill** keeps oversized text/image results as an ordered head/tail within a shared token budget plus a path to the complete result, so context stays small without losing the data.
- Feed both into the same budget rather than reaching for compaction first: compaction is the only option that both costs a request and breaks the cache.

## Hidden extra requests

LLM-generated session titles (a deterministic title provider costs nothing), compaction summaries, auxiliary web-search requests, and optional LLM-based auto-review. Each is a real request against the same budget.

## Delegation shape matters for cache

A **forked** child inherits the parent's byte-identical prefix under the same provider/model, so it reuses the parent's cache; a **spawned** child has an independent cache. Prefer forks when delegating from inside the harness.

## Reasoning effort is the largest single lever

Reasoning tokens bill as output. A long generation can spend the majority of its output tokens on reasoning — measure before optimizing anything structural, and lower reasoning effort for routine edits.

## Operating rules

1. **One warm session per repo, reused.** Whole-project context cached beats re-reading it cold on every task; the gap between one-shot invocation and a reused session is an order of magnitude, not a percentage.
2. **Pin the model per session.** Any route change throws away the prefix you paid for.
3. **Batch tasks within the provider's cache retention window.** Three tasks in one burst is one miss plus two hits; the same three spread an hour apart are three misses. Prefer resuming a session over re-running a task.
4. **Prefer append-only knobs for anything you may need to flip mid-run** (permissions, sandbox mode) and settle cache-hostile ones (plugin roster, model route, plan mode) before the session starts.

## Measure instead of arguing

The harness exposes per-session figures — cache hit rate, input tokens, output tokens, time to first token, decode rate — through its session stats (available to Hermes through a bridge's session-stats tool). Run the same small task suite under each candidate shape and read the numbers off the harness; a cost claim about which shape is cheaper should always be either quoted from the harness or measured, never asserted.
