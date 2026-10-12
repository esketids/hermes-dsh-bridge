/**
 * dsh-hermes-thin — a thin, cache-optimised MCP bridge between Hermes Agent and the
 * DeepSeek Harness DESKTOP app.
 *
 * Runs INSIDE the harness (mounted in the `desktop` profile), so every agent it starts
 * is a real harness session that appears in the app: same process, same session store,
 * same workspace grouping as a session you opened by hand.
 *
 * Design constraints (deliberate, see README):
 *   1. ONE resident agent per cwd, reused forever. A fresh agent reloads the whole
 *      project context as an uncached prefix; reuse is the entire cost story.
 *   2. AUTHORISATION LIVES ON HERMES. The plugin never prompts and never asks a human:
 *      it pins a permission preset (default `hermes-managed` = sandbox workspace-write +
 *      approval never) at session creation, so the harness never gates on a person.
 *      Hermes decides *whether* to dispatch and *which* cwd; the sandbox still confines
 *      the blast radius to the workspace.
 *   3. Nothing that invalidates the provider prefix is done at runtime: no plugin/tool
 *      roster changes, no model switching, no plan-mode toggling mid-session.
 *
 * MCP surface: a hand-rolled StreamableHTTP-subset server (initialize / tools/list /
 * tools/call) so this package has ZERO npm dependencies. Harness packages are imported
 * as bare specifiers and resolve through the host installation's own anchor — do NOT
 * add @deepseek-ai/* to dependencies, that is exactly what creates a second copy and
 * breaks the Symbol identity the harness relies on.
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import Schema from '@deepseek-ai/schemastery'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { resolve as resolvePath, sep } from 'node:path'

export const name = 'hermes-thin'

/** Services this plugin needs before it may activate. Cordis guards ctx property access:
 *  touching a service that is not injected throws, so everything reachable from here is listed. */
export const inject = ['agents', 'agentPresets', 'permissionPresets', 'sessionTitle', 'workspaceRegistry']

export const Config = Schema.object({
  host: Schema.string().default('127.0.0.1'),
  port: Schema.number().default(8791),
  /** Pinned route. Never switch it mid-project: a new route is a new cache domain. */
  provider: Schema.string().default('openrouter'),
  model: Schema.string().default('deepseek/deepseek-v4.1-flash'),
  /** off | minimal | low | medium | high | xhigh | max — the shipped adapter default is `high`. */
  reasoningEffort: Schema.string().default('medium'),
  maxTokens: Schema.number().default(0),
  /** Agent preset mounted for new sessions (the harness' own tool composition). */
  preset: Schema.string().default('standard'),
  /** Permission preset pinned into every session this bridge creates. */
  permissionPreset: Schema.string().default('hermes-managed'),
  /** Optional cwd allow-list. Empty = any path Hermes names. */
  workspaceRoots: Schema.array(Schema.string()).default([]),
  maxAgents: Schema.number().default(8),
  taskTimeoutMs: Schema.number().default(1800000),
  /** Optional bearer token; when set, every request but /health needs it. */
  authToken: Schema.string().default(''),
  /** Tier 2 = mutating ops (project edits, terminal, settings, jobs). Off by default. */
  enableTier2: Schema.boolean().default(false),
  /** Explicit per-op allow/deny overrides, as "group.op" strings. */
  allowOps: Schema.array(Schema.string()).default([]),
  denyOps: Schema.array(Schema.string()).default([]),
  /** Keep a ring buffer of the last N dispatched ops, visible via dsh_commands. */
  audit: Schema.boolean().default(true),
  auditLimit: Schema.number().default(200),
  /** Tier 3 = authority/credential surfaces and anything that can install code. Off by default. */
  enableTier3: Schema.boolean().default(false),
  /** How long a fetched service catalog stays fresh, in ms. */
  catalogTtlMs: Schema.number().default(60000),
})

const PROTOCOL = '2025-06-18'
const SERVER_INFO = { name: 'dsh-hermes-thin', version: '0.1.1' }
const PLUGIN_ID = 'hermes-thin'

/* ────────────────────────── helpers ────────────────────────── */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** Accumulate one usage record into a totals object (tolerant of adapter spellings). */
function addUsage(t, u) {
  if (u === undefined || u === null || typeof u !== 'object') return t
  t.input += num(u.inputTokens ?? u.input ?? u.promptTokens)
  t.output += num(u.outputTokens ?? u.output)
  t.cacheRead += num(u.cacheReadTokens ?? u.cacheRead ?? u.promptCacheHitTokens ?? u.prompt_cache_hit_tokens)
  t.cacheWrite += num(u.cacheWriteTokens ?? u.cacheWrite ?? u.cacheCreationTokens)
  return t
}

/** cacheRead as a share of all prompt-side tokens seen in the fold. */
function hitRate(t) {
  const denom = t.cacheRead > 0 && t.input > 0 && t.cacheRead <= t.input
    ? t.input
    : t.input + t.cacheRead + t.cacheWrite
  if (denom <= 0) return null
  return Math.min(1, Math.round((t.cacheRead / denom) * 10000) / 10000)
}

/** Fold a slice of session events into counts + token totals. */
function fold(events) {
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  const out = { turns: 0, steps: 0, toolCalls: 0, text: '', usage: t }
  for (const e of events ?? []) {
    const type = e?.type
    const d = e?.data ?? {}
    if (type === 'turn/end') out.turns += 1
    else if (type === 'step/end') out.steps += 1
    else if (type === 'tool/call') out.toolCalls += 1
    else if (type === 'assistant/message') {
      addUsage(t, d.usage)
      const text = collectText(d.message ?? d.content)
      if (text.trim() !== '') out.text = text
    }
  }
  out.cacheHitRate = hitRate(t)
  return out
}

/** Pull plain text out of a message-shaped value without assuming one shape. */
function collectText(value, sink = []) {
  if (typeof value === 'string') { sink.push(value); return sink.join('') }
  if (Array.isArray(value)) { for (const v of value) collectText(v, sink); return sink.join('') }
  if (value && typeof value === 'object') {
    const rec = value
    if (typeof rec.text === 'string') sink.push(rec.text)
    else if (rec.content !== undefined) collectText(rec.content, sink)
  }
  return sink.join('')
}

const logOf = (agent) => (agent?.session?.log ?? [])

/* ────────────────────────── plugin ────────────────────────── */

export function apply(ctx, config = {}) {
  const cfg = {
    host: config.host ?? '127.0.0.1',
    port: Number(config.port ?? 8791),
    provider: config.provider ?? 'openrouter',
    model: config.model ?? 'deepseek/deepseek-v4.1-flash',
    reasoningEffort: config.reasoningEffort ?? 'medium',
    maxTokens: Number(config.maxTokens ?? 0),
    preset: config.preset ?? 'standard',
    permissionPreset: config.permissionPreset ?? 'hermes-managed',
    workspaceRoots: (config.workspaceRoots ?? []).map((p) => resolvePath(p)),
    maxAgents: Number(config.maxAgents ?? 8),
    taskTimeoutMs: Number(config.taskTimeoutMs ?? 1800000),
    authToken: config.authToken ?? '',
    enableTier2: config.enableTier2 === true,
    allowOps: config.allowOps ?? [],
    denyOps: config.denyOps ?? [],
    audit: config.audit !== false,
    auditLimit: Number(config.auditLimit ?? 200),
    enableTier3: config.enableTier3 === true,
    catalogTtlMs: Number(config.catalogTtlMs ?? 60000),
  }

  // Fail loudly at load rather than at the first call: a bad deployment value should be a
  // visible boot error, per the harness' plugin-configuration convention.
  const problems = []
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) problems.push(`port must be an integer 1-65535 (got ${config.port})`)
  if (typeof cfg.host !== 'string' || cfg.host.trim() === '') problems.push('host must be a non-empty string')
  if (typeof cfg.provider !== 'string' || cfg.provider.trim() === '') problems.push('provider must name a registered route (e.g. openrouter)')
  if (typeof cfg.model !== 'string' || cfg.model.trim() === '') problems.push('model must be a provider-owned model id')
  if (!['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(cfg.reasoningEffort)) problems.push(`reasoningEffort must be one of off|minimal|low|medium|high|xhigh|max (got ${cfg.reasoningEffort})`)
  if (typeof cfg.preset !== 'string' || cfg.preset.trim() === '') problems.push('preset must name an agent preset')
  if (typeof cfg.permissionPreset !== 'string' || cfg.permissionPreset.trim() === '') problems.push('permissionPreset must name a permission preset')
  if (!Number.isInteger(cfg.maxAgents) || cfg.maxAgents < 1) problems.push(`maxAgents must be a positive integer (got ${config.maxAgents})`)
  if (!Number.isFinite(cfg.taskTimeoutMs) || cfg.taskTimeoutMs < 1000) problems.push(`taskTimeoutMs must be at least 1000 (got ${config.taskTimeoutMs})`)
  if (!Number.isInteger(cfg.auditLimit) || cfg.auditLimit < 1) problems.push(`auditLimit must be a positive integer (got ${config.auditLimit})`)
  if (!Number.isFinite(cfg.catalogTtlMs) || cfg.catalogTtlMs < 0) problems.push(`catalogTtlMs must be zero or more (got ${config.catalogTtlMs})`)
  for (const key of ['allowOps', 'denyOps']) {
    for (const entry of cfg[key]) {
      if (typeof entry !== 'string' || !/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/.test(entry)) {
        problems.push(`${key} entries must look like "group.op" (got ${JSON.stringify(entry)})`)
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`hermes-thin configuration rejected: ${problems.join('; ')}`)
  }
  const log = (...a) => ctx.logger?.info?.('[hermes-thin]', ...a)

  /** cwd → resident session. Never disposed while the plugin lives: that is the point. */
  const pool = new Map()
  /** cwd → tail of the serial chain, so two calls never interleave on one session. */
  const locks = new Map()
  /** setup() outcomes, one per agent created — the dual-package hazard shows up here. */
  const setupLog = []
  /** last error raised inside a task, surfaced by dsh_debug. */
  let lastError = null
  /**
   * Optional Host service. Dynamic injection (not the static `inject` list) so a composition
   * without it still activates — the public write path for projects is `workspaceController`,
   * whose request-shaped methods are `create` / `rename` / `delete`.
   */
  let workspaceController = null
  /** The harness' own tool registry, reached the same guarded way. */
  let toolsRegistry = null
  /** The Cordis inspection registry (host runner) — the official "what exists?" surface. */
  let cordisInspect = null
  /**
   * Every optional Host service this plugin asks for. `ctx.inject` fires only when the service
   * is actually mounted, so listing a name that this composition lacks is free — and it is what
   * turns "not reachable" into "reachable" without hardcoding a resolution path.
   */
  const OPTIONAL_SERVICES = [
    'workspaceController', 'tools', 'cordisInspect', 'loader', 'profileContext',
    'lsp', 'planMode', 'schedule', 'terminals', 'speechToText', 'agentTeams', 'agentLoop',
    'sessionQuery', 'sessionProjectionCache', 'sessionProjections', 'sessions', 'sessionPersistence',
    'goals', 'jobs', 'commands', 'skills', 'settings', 'sandboxPolicy', 'approval', 'tokenMeter',
    'llm', 'attachments', 'hmr', 'workflowEngine', 'webhookRuntime', 'storage', 'storageDomain',
    'workspaceFiles', 'workspaceChanges', 'userQuestions', 'subagents', 'systemPrompt',
    'spillStore', 'typert', 'typertGateway', 'webServer', 'timer', 'toolResultPruner',
    'shell', 'shellEnv', 'ssh', 'subprocess', 'fs',
    // tier 3 names: injecting makes them *reachable*, the tier gate still decides callability
    'credentials', 'credentialsController', 'deepseekAccount', 'authorization', 'pluginManager', 'configEditor',
  ]
  const injectedServices = new Map()
  for (const serviceName of OPTIONAL_SERVICES) {
    try {
      ctx.inject?.([serviceName], (c) => { injectedServices.set(serviceName, c[serviceName]) })
    } catch { /* not mounted in this composition */ }
  }
  try {
    ctx.inject?.(['workspaceController'], (c) => { workspaceController = c.workspaceController })
    ctx.inject?.(['tools'], (c) => { toolsRegistry = c.tools })
    ctx.inject?.(['cordisInspect'], (c) => { cordisInspect = c.cordisInspect })
  } catch (e) {
    log('optional service injection failed:', String(e?.message ?? e))
  }

  const allowed = (cwd) => {
    if (cfg.workspaceRoots.length === 0) return true
    return cfg.workspaceRoots.some((root) => cwd === root || cwd.startsWith(root + sep))
  }

  async function canonical(p) {
    try { return await realpath(p) } catch { return resolvePath(p) }
  }

  /** Group a session into the app sidebar's project list (best-effort, never fatal). */
  async function attach(cwd, sessionId) {
    try {
      const reg = ctx.workspaceRegistry
      if (!reg) return
      const ws = (await reg.resolveByPath?.(cwd)) ?? (await reg.create?.(cwd))
      if (ws?.attachSession) await ws.attachSession(sessionId)
    } catch (e) {
      log('workspace attach skipped:', String(e?.message ?? e))
    }
  }

  /**
   * Pin the permission knobs that keep authorisation on Hermes' side: sandbox confined to
   * the workspace, approval never (so nothing ever waits for a human and nothing fails
   * closed on a missing answerer).
   *
   * Two paths, tried in order, because the knob setters are what the preset service itself
   * uses internally: (1) the named preset from the profile patch, (2) the raw knobs.
   */
  async function pinPermission(handle) {
    const session = handle?.agent?.session
    const agent = handle?.agent
    if (!session) return
    try {
      if (ctx.permissionPresets?.set) {
        ctx.permissionPresets.set(session, cfg.permissionPreset)
        return
      }
    } catch (e) {
      log(`permission preset "${cfg.permissionPreset}" unusable, falling back to raw knobs:`, String(e?.message ?? e))
    }
    try {
      ctx.sandboxPolicy?.setSandboxMode?.(session, 'workspace-write')
      ctx.approval?.setPolicy?.(agent, 'never')
    } catch (e) {
      log('permission knob pin failed:', String(e?.message ?? e))
    }
  }

  /** Pull tool names out of the registry's view shape (Map name→definition, or Sets/arrays). */
  function toolNames(view) {
    if (view === undefined || view === null) return null
    const pick = (container) => {
      const out = []
      if (container instanceof Map) { for (const k of container.keys()) if (typeof k === 'string') out.push(k) }
      else if (container instanceof Set) { for (const v of container.values()) if (typeof v === 'string') out.push(v) }
      else if (Array.isArray(container)) { for (const v of container) if (typeof v === 'string') out.push(v) }
      else if (typeof container === 'object') { for (const k of Object.keys(container)) out.push(k) }
      return out
    }
    const visible = pick(view.visible)
    const restrictable = pick(view.restrictableNames)
    const known = pick(view.knownNames)
    return {
      visible: [...new Set(visible)].sort(),
      restrictableCount: restrictable.length,
      knownCount: known.length,
      keys: Object.keys(view),
    }
  }

  /** Mount the harness' own agent preset (tools, prompt sections) into a new agent. */
  function makeSetup() {
    return async (agentCtx) => {
      const rec = { scopeChecked: false, scoped: null, mounted: false, error: null, toolView: null }
      setupLog.push(rec)
      try {
        let scoped = true
        try {
          const mod = await import('@deepseek-ai/dsh-scope')
          scoped = mod.scopeOf?.(agentCtx) !== undefined
          rec.scopeChecked = true
        } catch (e) { rec.error = `scope probe: ${String(e?.message ?? e)}` }
        rec.scoped = scoped
        if (!scoped) {
          log('agent ctx unscoped; preset mount skipped (agent will have no tools)')
          return
        }
        await ctx.agentPresets.mount(agentCtx, cfg.preset)
        rec.mounted = true
        // Tools are AGENT-scoped: the plugin's own context sees an almost empty view, so the
        // agent's real roster has to be read here, inside its scoped context.
        try { rec.toolView = toolNames(agentCtx.tools?.view?.()) } catch (e) { rec.toolViewError = String(e?.message ?? e).slice(0, 120) }
      } catch (e) {
        rec.error = `preset mount: ${String(e?.message ?? e)}`
        log('preset mount failed:', rec.error)
      }
    }
  }

  const agentOptions = () => ({
    provider: cfg.provider,
    ...(cfg.model ? { model: cfg.model } : {}),
    ...(cfg.reasoningEffort ? { reasoningEffort: cfg.reasoningEffort } : {}),
    ...(cfg.maxTokens > 0 ? { maxTokens: cfg.maxTokens } : {}),
  })

  function evictIfNeeded() {
    while (pool.size >= cfg.maxAgents) {
      const oldest = pool.keys().next().value
      if (oldest === undefined) break
      const rec = pool.get(oldest)
      pool.delete(oldest)
      log('evicted resident session for', oldest, String(rec?.sessionId ?? ''))
    }
  }

  /** Get the resident agent for `cwd`, creating (or adopting/resuming) it if needed. */
  async function resident(cwd, wanted) {
    const existing = pool.get(cwd)
    if (existing && (wanted === undefined || String(existing.sessionId) === String(wanted))) return existing

    if (wanted !== undefined) {
      const sid = SessionId(String(wanted))
      const live = ctx.agents.get?.(sid)
      if (live) {
        const rec = { sessionId: sid, handle: { agent: live, dispose: async () => {} }, resident: false }
        pool.set(cwd, rec)
        await attach(cwd, sid)
        return rec
      }
      const handle = await ctx.agents.resume({
        resumeSessionId: sid,
        agentOptions: agentOptions(),
        setup: makeSetup(),
      })
      const rec = { sessionId: sid, handle, resident: false }
      pool.set(cwd, rec)
      await attach(cwd, sid)
      return rec
    }

    evictIfNeeded()
    const sid = SessionId(randomUUID())
    const handle = await ctx.agents.create({
      sessionId: sid,
      meta: { cwd, agentPreset: cfg.preset },
      agentOptions: agentOptions(),
      setup: makeSetup(),
    })
    const rec = { sessionId: sid, handle, resident: true }
    pool.set(cwd, rec)
    await pinPermission(handle)
    await attach(cwd, sid)
    log('created resident session', String(sid), 'for', cwd)
    return rec
  }

  /** Serialise work per cwd so one resident session never gets two prompts at once. */
  function withLock(cwd, fn) {
    const prev = locks.get(cwd) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    locks.set(cwd, next.then(() => {}, () => {}))
    return next
  }

  async function runTask({ task, cwd, session_id, title }) {
    if (typeof task !== 'string' || task.trim() === '') throw new Error('task is required')
    if (typeof cwd !== 'string' || cwd.trim() === '') throw new Error('cwd is required')
    const canonicalCwd = await canonical(cwd)
    if (!allowed(canonicalCwd)) throw new Error(`cwd is outside the configured workspaceRoots: ${canonicalCwd}`)

    return withLock(canonicalCwd, async () => {
      const rec = await resident(canonicalCwd, session_id)
      const agent = rec.handle?.agent
      if (!agent) throw new Error('agent unavailable for this session')

      if (title !== undefined) {
        try { ctx.sessionTitle?.rename?.(agent.session, title) } catch { /* cosmetic */ }
      }

      const baseline = logOf(agent).length
      const started = Date.now()
      // Session format v4 refuses the retired `{kind:'plugin', plugin:…}` wrapper: a durable
      // message must carry its PRODUCER's own kind (the shipped webhook row does the same).
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: task }],
        source: { kind: PLUGIN_ID },
      }))

      let timedOut = false
      try {
        await Promise.race([
          agent.whenIdle(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('__timeout__')), cfg.taskTimeoutMs)),
        ])
      } catch (e) {
        if (String(e?.message) === '__timeout__') timedOut = true
        else { lastError = String(e?.message ?? e); throw e }
      }

      const slice = logOf(agent).slice(baseline)
      const folded = fold(slice)
      const whole = fold(logOf(agent))
      return {
        sessionId: String(rec.sessionId),
        cwd: canonicalCwd,
        resident: rec.resident,
        timedOut,
        elapsedMs: Date.now() - started,
        text: folded.text,
        run: { turns: folded.turns, steps: folded.steps, toolCalls: folded.toolCalls, cacheHitRate: folded.cacheHitRate, ...folded.usage },
        session: { turns: whole.turns, cacheHitRate: whole.cacheHitRate, ...whole.usage },
      }
    })
  }

  function listSessions({ cwd } = {}) {
    const want = cwd === undefined ? undefined : resolvePath(cwd)
    const rows = []
    for (const [key, rec] of pool) {
      if (want !== undefined && key !== want) continue
      const agent = rec.handle?.agent
      const folded = fold(logOf(agent))
      rows.push({
        sessionId: String(rec.sessionId),
        cwd: key,
        resident: rec.resident,
        live: true,
        title: agent?.session?.header?.title ?? agent?.session?.title ?? null,
        turns: folded.turns,
        cacheHitRate: folded.cacheHitRate,
        inputTokens: folded.usage.input,
        outputTokens: folded.usage.output,
        cacheReadTokens: folded.usage.cacheRead,
      })
    }
    return { poolSize: pool.size, sessions: rows }
  }

  /** Projects as the app's sidebar knows them. */
  function listWorkspaces() {
    const rows = []
    try {
      for (const ws of ctx.workspaceRegistry?.list?.() ?? []) {
        const path = ws?.path ?? ws?.root ?? null
        rows.push({
          id: ws?.id ?? null,
          path,
          title: ws?.title ?? null,
          sessions: Array.isArray(ws?.sessionIds) ? ws.sessionIds.length : null,
          warm: path !== null && pool.has(path),
        })
      }
    } catch (e) {
      lastError = String(e?.message ?? e)
    }
    return { count: rows.length, workspaces: rows, warmCwds: [...pool.keys()] }
  }

  /** Register a folder as a project in the app's sidebar (idempotent). */
  async function addWorkspace({ path: p, title }) {
    if (typeof p !== 'string' || p.trim() === '') throw new Error('path is required')
    const canonicalPath = await canonical(p)
    if (!allowed(canonicalPath)) throw new Error(`path is outside the configured workspaceRoots: ${canonicalPath}`)
    const reg = ctx.workspaceRegistry
    const existing = await reg?.resolveByPath?.(canonicalPath)
    if (existing) {
      let retitled = false
      if (typeof title === 'string' && title !== '' && existing.title !== title) {
        try {
          if (workspaceController?.rename) await workspaceController.rename({ workspaceId: String(existing.id), title })
          else if (existing.setTitle) await existing.setTitle(title)
          retitled = true
        } catch (e) { lastError = String(e?.message ?? e) }
      }
      return { created: false, retitled, id: existing.id ?? null, path: existing.path ?? canonicalPath, title: retitled ? title : (existing.title ?? null) }
    }
    const ws = await reg.create(canonicalPath, title)
    return { created: true, id: ws?.id ?? null, path: ws?.path ?? canonicalPath, title: ws?.title ?? null }
  }

  /** Remove a project from the sidebar. Folders, files and session histories are never touched. */
  async function removeWorkspace({ path: p, id }) {
    let wsId = id
    if (wsId === undefined) {
      if (typeof p !== 'string' || p.trim() === '') throw new Error('pass the project path or its id')
      const ws = await ctx.workspaceRegistry?.resolveByPath?.(await canonical(p))
      wsId = ws?.id
    }
    if (wsId === undefined) throw new Error('no project found for that path or id')
    const id_ = String(wsId)
    const failures = []
    // The Host workspace controller is the public write path; its registry method is `delete`.
    try {
      if (workspaceController?.delete) {
        await workspaceController.delete({ workspaceId: id_ })
        return { removed: id_, via: 'workspaceController.delete' }
      }
    } catch (e) { failures.push(`controller: ${String(e?.message ?? e)}`) }
    try {
      if (ctx.workspaceRegistry?.delete) {
        await ctx.workspaceRegistry.delete(id_)
        return { removed: id_, via: 'workspaceRegistry.delete' }
      }
    } catch (e) { failures.push(`registry: ${String(e?.message ?? e)}`) }
    throw new Error(`could not remove the project registration (${failures.join('; ') || 'no removal path exposed'}) — remove it in the app sidebar instead; folders, files and session histories are never deleted`)
  }

  function statsFor({ session_id }) {
    if (typeof session_id !== 'string') throw new Error('session_id is required')
    const sid = SessionId(session_id)
    // Report the same key names dsh_sessions uses, so the two tools cannot disagree.
    const out = (folded) => ({
      inputTokens: folded.usage.input,
      outputTokens: folded.usage.output,
      cacheReadTokens: folded.usage.cacheRead,
      cacheWriteTokens: folded.usage.cacheWrite,
      turns: folded.turns,
      steps: folded.steps,
      toolCalls: folded.toolCalls,
      cacheHitRate: folded.cacheHitRate,
    })
    for (const rec of pool.values()) {
      if (String(rec.sessionId) !== session_id) continue
      return { sessionId: session_id, live: true, ...out(fold(logOf(rec.handle?.agent))) }
    }
    const live = ctx.agents.get?.(sid)
    if (!live) throw new Error(`session ${session_id} is not live in this process`)
    return { sessionId: session_id, live: true, ...out(fold(logOf(live))) }
  }

  /* ────────────────────────── self-describing command surface ──────────────────────────
   * The receiving end describes itself: one registry of ops, each tagged with a tier, and a
   * single dispatcher. Adding a capability = adding one entry here; the MCP/Hermes side never
   * changes, because it reads the descriptor at call time. Tiers:
   *   1 = read + dispatch (safe default)
   *   2 = mutate (project edits, settings, terminal, jobs, raw host calls) — opt-in
   *   3 = never exposed (credentials/account surfaces)
   */

  /** Ring buffer of dispatched ops, newest last. */
  const auditLog = []
  function audit(entry) {
    if (!cfg.audit) return
    auditLog.push(entry)
    while (auditLog.length > cfg.auditLimit) auditLog.shift()
  }

  /** Read one Host service without tripping Cordis' property guard. */
  function service(name) {
    try {
      const value = ctx[name]
      return value ?? null
    } catch { return null }
  }

  /**
   * Probing, not reflection: Cordis does not expose services as own keys of the context
   * (a key walk finds only `baseUrl`/`fiber`), so candidate names are probed directly through
   * the guarded accessor. This is the honest way to answer "what can this plugin call?".
   */
  const SERVICE_CANDIDATES = [
    'agents', 'agentLoop', 'agentPresets', 'permissionPresets', 'sessionTitle', 'workspaceRegistry',
    'workspaceController', 'tools', 'sessions', 'sessionQuery', 'sessionProjections', 'sessionStats',
    'llm', 'tokenMeter', 'sandboxPolicy', 'approval', 'shell', 'fs', 'jobs', 'commands', 'settings',
    'attachments', 'skills', 'schedule', 'webhooks', 'pluginManager', 'credentials', 'hmr',
    'cordisInspect', 'dynamicCordisRunner', 'loader', 'profileContext', 'directoryPickerController',
    'sessionPersistence', 'sessionFormat', 'userQuestions', 'jobsLocal', 'terminal', 'workspaceFiles',
  ]

  function knownServices() {
    const rows = []
    for (const name of SERVICE_CANDIDATES) {
      let value
      try { value = ctx[name] } catch (e) { rows.push({ name, readable: false, why: String(e?.message ?? e).slice(0, 90) }); continue }
      if (value === undefined || value === null) { rows.push({ name, readable: false, why: 'not mounted in this composition' }); continue }
      const methods = typeof value === 'object' ? Object.keys(value).filter((k) => typeof value[k] === 'function') : []
      rows.push({ name, readable: true, kind: typeof value, methodCount: methods.length, methods: methods.slice(0, 16) })
    }
    return {
      note: 'Probed by name; Cordis hides services from key reflection. "readable" means this plugin can reach it right now.',
      readable: rows.filter((r) => r.readable).map((r) => r.name),
      services: rows,
    }
  }

  /** The harness' own registered tools (what its agents can call). */
  function harnessTools() {
    const t = toolsRegistry ?? service('tools')
    if (t === null) return { available: false, names: [], why: 'the tools registry is not reachable from this plugin' }
    // Tools are agent-scoped and `view()` only reports a context's own registrations, so the
    // authoritative roster is the one the loop assembled into a request: `session.requestHeader().tools`.
    const headers = []
    for (const rec of pool.values()) {
      try {
        const h = rec.handle?.agent?.session?.requestHeader?.()
        if (h !== undefined && h !== null) headers.push(h)
      } catch { /* not yet requested */ }
    }
    const fromHeaders = [...new Set(headers.flatMap((h) => (h.tools ?? [])
      .map((t) => (typeof t === 'string' ? t : t?.name))
      .filter((n) => typeof n === 'string' && n !== '')))].sort()
    const fromAgents = [...new Set(setupLog.map((r) => r.toolView).filter(Boolean).flatMap((v) => v.visible ?? []))].sort()
    const local = toolNames((() => { try { return t.view?.() } catch { return null } })())
    const names = fromHeaders.length > 0 ? fromHeaders : (fromAgents.length > 0 ? fromAgents : (local?.visible ?? []))
    return {
      available: names.length > 0,
      count: names.length,
      scope: fromHeaders.length > 0
        ? 'agent request header (authoritative: what the model was offered)'
        : fromAgents.length > 0 ? 'agent setup view' : 'plugin context (minimal by design)',
      names: names.slice(0, 200),
      ...(fromHeaders.length === 0 ? { why: 'no agent in this process has sent a request yet — the header appears after the first turn' } : {}),
      agentViews: setupLog.map((r) => r.toolView).filter(Boolean),
      pluginView: local,
    }
  }
  /** JSON-safe, truncated view of arbitrary registry answers (Maps/Sets included). */
  function safeView(value, depth = 0) {
    if (value === undefined) return 'undefined'
    if (value === null) return null
    if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}…` : value
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'function') return '[function]'
    if (depth > 3) return '[deep]'
    if (value instanceof Map) return { '[Map]': [...value.entries()].slice(0, 30).map(([k, v]) => [String(k), safeView(v, depth + 1)]) }
    if (value instanceof Set) return { '[Set]': [...value.values()].slice(0, 60).map((v) => safeView(v, depth + 1)) }
    if (Array.isArray(value)) return value.slice(0, 60).map((v) => safeView(v, depth + 1))
    if (typeof value === 'object') {
      const out = {}
      for (const k of Object.keys(value).slice(0, 30)) out[k] = safeView(value[k], depth + 1)
      return out
    }
    return String(value)
  }

  /**
   * Ask the Cordis inspection registry what runtime APIs exist. This is the official discovery
   * surface (the host runner supplies it; Creator mode consumes it) and it is why the bridge
   * does not need a hand-maintained list of host services.
   */
  async function inspectRuntime({ platform, provider, method, input, args } = {}) {
    const ci = cordisInspect ?? service('cordisInspect')
    if (ci === null || ci === undefined) {
      return {
        available: false,
        why: 'the Cordis inspection registry is not reachable from this plugin (it is supplied by @deepseek-ai/dsh-cordis-host-runner)',
      }
    }
    const out = { available: true, service: 'cordisInspect', attempts: {} }
    try {
      out.providers = safeView(await ci.list?.())
    } catch (e) {
      out.attempts.list = String(e?.message ?? e).slice(0, 160)
    }
    const providerId = provider ?? args?.provider
    if (typeof providerId === 'string' && providerId !== '') {
      // Declared signature: query(platform, providerId, methodName, input, agent, signal) — positional,
      // and the implementation touches signal.throwIfAborted(), so a real AbortSignal is required.
      const methodName = method ?? args?.method ?? 'listService'
      const payload = input ?? args?.input
      const anyAgent = [...pool.values()].map((r) => r.handle?.agent).find((a) => a !== undefined)
      const controller = new AbortController()
      try {
        const answered = await ci.query(
          platform ?? args?.platform ?? 'host',
          providerId,
          methodName,
          payload === undefined ? undefined : payload,
          anyAgent,
          controller.signal,
        )
        out.query = { platform: platform ?? 'host', provider: providerId, method: methodName, agentAttached: anyAgent !== undefined, result: safeView(answered) }
      } catch (e) {
        out.attempts[`query(${providerId}, ${methodName})`] = String(e?.message ?? e).slice(0, 200)
        // Fall back to object-shaped calls in case a build expects a request object.
        for (const callArgs of [[{ platform: platform ?? 'host', provider: providerId, method: methodName, input: payload }], [providerId], [{ providerId }]]) {
          try {
            out.query = { calledWith: JSON.stringify(callArgs).slice(0, 110), result: safeView(await ci.query?.(...callArgs)) }
            break
          } catch (e2) { out.attempts[`fallback ${JSON.stringify(callArgs).slice(0, 50)}`] = String(e2?.message ?? e2).slice(0, 140) }
        }
      }
    }
    return out
  }

  /* ────────────────────────── live catalog: the whole harness surface ──────────────────────────
   * The running app publishes its own service directory (Cordis inspection registry → `Service`
   * provider). That becomes the registry's second half: any service method is dispatchable as
   * { group: <serviceKey>, op: <methodName> }, so a new DSH feature needs no code here.
   *
   * Tiers for catalog methods: everything is tier 2 — the catalog carries no read/write metadata,
   * so any generic call must be treated as mutation-capable. Authority, credential, telemetry and
   * code-installing services are tier 3, behind their own flag.
   */
  const TIER3_SERVICES = new Set([
    'credentials', 'credentialsController', 'deepseekAccount', 'authorization',
    'pluginManager', 'configEditor', 'inspector', 'pluginRegistryProbe',
    'productAnalytics', 'productTelemetry', 'otel',
  ])
  const catalogTierFor = (key) => (TIER3_SERVICES.has(key) ? 3 : 2)

  let catalogCache = { at: 0, value: null }

  /** The catalog publishes method *signatures*; the callable name is derived from one. */
  function methodNameOf(m) {
    if (typeof m === 'string') return m
    if (m?.name) return m.name
    const sig = m?.signature
    if (typeof sig !== 'string') return null
    const remote = sig.match(/@Remote\(\s*['"]([^'"]+)['"]\s*\)/)
    if (remote) return remote[1]
    // Anchored first, then anywhere: the catalog pads some signatures with markers like "*** ".
    const cleaned = sig.replace(/^\s*(?:async\s+)?/, '')
    const anchored = cleaned.match(/^([A-Za-z_$][\w$]*)\s*\(/)
    if (anchored) return anchored[1]
    const loose = sig.match(/([A-Za-z_$][\w$]*)\s*\(/)
    return loose ? loose[1] : null
  }

  /** Method names that exist on a live service object (own + prototype), for services the
   *  catalog leaves undescribed — several tier-3 services publish no methods at all. */
  function liveMethodNames(target) {
    if (target === null || target === undefined) return []
    const names = new Set()
    let node = target
    let depth = 0
    while (node !== null && node !== undefined && depth < 6) {
      for (const name of Object.getOwnPropertyNames(node)) {
        if (name === 'constructor' || name.startsWith('_') || name.startsWith('#')) continue
        try {
          if (typeof target[name] === 'function') names.add(name)
        } catch { /* getter threw */ }
      }
      node = Object.getPrototypeOf(node)
      depth += 1
    }
    return [...names].sort()
  }

  /** Fetch (and cache) the live Host service catalog. */
  async function liveCatalog({ refresh = false } = {}) {
    if (!refresh && catalogCache.value !== null && (Date.now() - catalogCache.at) < cfg.catalogTtlMs) {
      return catalogCache.value
    }
    const ci = cordisInspect ?? service('cordisInspect')
    if (ci === null || ci === undefined) {
      return { available: false, why: 'the Cordis inspection registry is unreachable, so the catalog cannot be read' }
    }
    const agent = [...pool.values()].map((r) => r.handle?.agent).find((a) => a !== undefined)
    try {
      const raw = await ci.query('host', 'Service', 'listService', undefined, agent, new AbortController().signal)
      const services = (raw?.services ?? []).map((s) => ({
        key: s.key,
        description: s.description,
        methods: (s.methods ?? []).map((m) => ({
          name: methodNameOf(m),
          signature: (typeof m === 'object' && m !== null ? m.signature : null) ?? null,
          description: (typeof m === 'object' && m !== null ? m.description : null) ?? null,
        })).filter((m) => typeof m.name === 'string' && m.name !== ''),
      }))
      catalogCache = { at: Date.now(), value: { available: true, mode: raw?.mode ?? null, count: services.length, services } }
    } catch (e) {
      catalogCache = { at: Date.now(), value: { available: false, why: String(e?.message ?? e).slice(0, 200) } }
    }
    return catalogCache.value
  }

  /** Compact, tier-annotated report of the live catalog (optionally one service, optionally expanded). */
  async function catalogReport({ service, expand = false, refresh = false } = {}) {
    const catalog = await liveCatalog({ refresh })
    if (catalog.available === false) return { available: false, why: catalog.why }
    const wanted = (catalog.services ?? []).filter((s) => service === undefined || s.key === service)
    const rows = wanted.map((s) => {
      const tier = catalogTierFor(s.key)
      const perm = permissionForTier(tier, `${s.key}.<method>`)
      const showMethods = expand || service !== undefined
      // Some mounted services publish no methods in the catalog; read them off the live object.
      const catalogMethods = s.methods ?? []
      const live = catalogMethods.length === 0 ? liveMethodNames(resolveService(s.key)) : []
      const methods = (catalogMethods.length > 0 ? catalogMethods : live.map((name) => ({ name, signature: null })))
      return {
        key: s.key,
        tier,
        callable: perm.allowed,
        ...(perm.allowed ? {} : { blocked: perm.why }),
        methodCount: methods.length,
        ...(live.length > 0 ? { methodsFrom: 'live object (catalog publishes none)' } : {}),
        description: s.description,
        ...(showMethods
          ? { methods: methods.map((m) => ({ op: m.name, ...(m.signature ? { signature: m.signature } : {}) })) }
          : {}),
      }
    })
    return {
      available: true,
      servicesPublished: catalog.count,
      shown: rows.length,
      ...(service !== undefined && rows.length === 0
        ? { note: `no published service with key "${service}" — dsh_commands lists mountedServices, which is what is actually live in this composition` }
        : {}),
      ...(service === undefined && !expand ? { hint: 'pass expand:true (or service:"<key>") to get method names and signatures' } : {}),
      services: rows,
    }
  }

  /** Reach a Host service: injected first, then ctx.get(), then plain property access (all guarded). */
  function resolveService(key) {
    const injected = { workspaceController, tools: toolsRegistry, cordisInspect }
    if (injected[key] !== undefined && injected[key] !== null) return injected[key]
    const held = injectedServices.get(key)
    if (held !== undefined && held !== null) return held
    try {
      const viaGet = ctx.get?.(key)
      if (viaGet !== undefined && viaGet !== null) return viaGet
    } catch { /* guarded */ }
    try {
      const direct = ctx[key]
      if (direct !== undefined && direct !== null) return direct
    } catch { /* guarded */ }
    return null
  }

  /** Parse "name(a: A, b?: B): C" → [{name, optional, type}] using top-level commas only. */
  function signatureParams(sig) {
    if (typeof sig !== 'string') return []
    const open = sig.indexOf('(')
    if (open === -1) return []
    let depth = 0
    let close = -1
    for (let i = open; i < sig.length; i++) {
      const ch = sig[i]
      if ('(<[{'.includes(ch)) depth++
      else if (ch === ')') { depth--; if (depth === 0) { close = i; break } }
      else if (')>]}'.includes(ch)) depth--
    }
    if (close === -1) return []
    const inner = sig.slice(open + 1, close)
    const parts = []
    let buf = ''
    let d = 0
    for (const ch of inner) {
      if ('(<[{'.includes(ch)) d++
      if (')>]}'.includes(ch)) d--
      if (ch === ',' && d === 0) { parts.push(buf); buf = '' } else buf += ch
    }
    if (buf.trim()) parts.push(buf)
    return parts.map((p) => {
      const m = p.trim().match(/^([A-Za-z_$][\w$]*)\s*(\?)?\s*(?::\s*([\s\S]+))?$/)
      return m ? { name: m[1], optional: Boolean(m[2]), type: (m[3] ?? '').trim() } : null
    }).filter(Boolean)
  }

  /** A value for one declared parameter — only the two the host insists on are synthesised. */
  function runtimeArgFor({ name, type }) {
    if (name === 'signal' || /\bAbortSignal\b/.test(type)) return new AbortController().signal
    if (name === 'agent' || /\bAgent\b/.test(type)) {
      return [...pool.values()].map((r) => r.handle?.agent).find((a) => a !== undefined)
    }
    return undefined
  }

  /** Ordered argument lists to try for a catalog method: as given first, then signature-derived. */
  function argumentCandidates(sig, callArgs) {
    const list = [callArgs]
    const params = signatureParams(sig)
    const liveAgent = [...pool.values()].map((r) => r.handle?.agent).find((a) => a !== undefined)
    const forParam = (p) => {
      if (p.name === 'signal' || /\bAbortSignal\b/.test(p.type)) return new AbortController().signal
      if (p.name === 'agent' || /\bAgent\b/.test(p.type)) return liveAgent
      if (p.name === 'session' || /\bSession$/.test(p.type)) return liveAgent
      return undefined
    }
    if (params.length > 0) {
      // Replace the caller's arguments wholesale — needed when the *first* declared parameter is
      // a runtime one (e.g. `listSessions(signal?: AbortSignal)`).
      const whole = params.map(forParam)
      if (whole.some((v) => v !== undefined)) list.push(whole)
      if (params.length > callArgs.length) {
        const tail = params.slice(callArgs.length).map(forParam)
        if (tail.some((v) => v !== undefined)) list.push([...callArgs, ...tail])
      }
    }
    if (liveAgent !== undefined) list.push([...callArgs, liveAgent, new AbortController().signal])
    list.push([...callArgs, new AbortController().signal])
    const seen = new Set()
    return list.filter((args) => {
      // typeof is not enough: an AbortSignal and a plain object are both "object". Use the
      // internal class tag plus arity so distinct candidates cannot collide.
      const key = args.length + ':' + args.map((v) => (v === undefined
        ? 'u'
        : (typeof v === 'object' && v !== null ? Object.prototype.toString.call(v) : typeof v))).join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const OPS = [
    // ── session ──
    { group: 'session', op: 'list', tier: 1, summary: 'Warm sessions this bridge holds', run: () => listSessions() },
    { group: 'session', op: 'stats', tier: 1, summary: 'Token/cache figures for a bridge session', params: { session_id: 'string' }, required: ['session_id'], run: (a) => statsFor(a) },
    // ── run ──
    { group: 'run', op: 'task', tier: 1, summary: 'Run a coding task in a repo (reuses the warm session)', params: { task: 'string', cwd: 'string', session_id: 'string', title: 'string' }, required: ['task', 'cwd'], run: (a) => runTask(a) },
    // ── workspace ──
    { group: 'workspace', op: 'list', tier: 1, summary: 'Projects shown in the app sidebar', run: () => listWorkspaces() },
    { group: 'workspace', op: 'add', tier: 2, summary: 'Register a folder as a project (retitles when it exists)', params: { path: 'string', title: 'string' }, required: ['path'], run: (a) => addWorkspace(a) },
    { group: 'workspace', op: 'remove', tier: 2, summary: 'Remove a project registration (files/sessions untouched)', params: { path: 'string', id: 'string' }, run: (a) => removeWorkspace(a) },
    // ── bridge ──
    { group: 'bridge', op: 'health', tier: 1, summary: 'Bridge health, pinned route, presets', run: () => CALL.dsh_health() },
    // ── harness introspection ──
    { group: 'harness', op: 'tools', tier: 1, summary: "Tool names registered in the harness itself", run: () => harnessTools() },
    { group: 'harness', op: 'services', tier: 1, summary: 'Which Host services this plugin can reach, probed by name', run: () => knownServices() },
    { group: 'harness', op: 'inspect', tier: 1, summary: 'Ask the Cordis inspection registry which runtime APIs exist (lists providers; with provider+method it queries one)', params: { platform: 'string', provider: 'string', method: 'string', input: 'object' }, run: (a) => inspectRuntime(a) },
    { group: 'harness', op: 'catalog', tier: 1, summary: 'The live Host service catalog — every service the app publishes, with tiers; expand or name a service for method names + signatures', params: { service: 'string', expand: 'boolean', refresh: 'boolean' }, run: (a) => catalogReport(a) },
    // ── gated escape hatch ──
    {
      group: 'host', op: 'call', tier: 2,
      summary: 'Call any Host service method directly (service, method, args[]) — the complete-control lever',
      params: { service: 'string', method: 'string', args: 'array' }, required: ['service', 'method'],
      run: async ({ service: svc, method, args }) => {
        const injected = { workspaceController, tools: toolsRegistry }
        const target = injected[svc] ?? service(svc)
        if (target === null || target === undefined) throw new Error(`no readable Host service named "${svc}" (try harness.services)`)
        if (typeof target[method] !== 'function') throw new Error(`service "${svc}" has no method "${method}"`)
        const out = await target[method](...(Array.isArray(args) ? args : []))
        return { service: svc, method, result: out === undefined ? null : out }
      },
    },
  ]

  function opKey(e) { return `${e.group}.${e.op}` }

  /** Tier/allow-deny decision for one "group.op" key. */
  function permissionForTier(tier, key) {
    if (cfg.denyOps.includes(key)) return { allowed: false, why: `${key} is in denyOps` }
    if (cfg.allowOps.includes(key)) return { allowed: true, why: 'explicitly allowed' }
    if (tier === 1) return { allowed: true, why: 'tier 1' }
    if (tier === 2) {
      return cfg.enableTier2
        ? { allowed: true, why: 'tier 2 enabled' }
        : { allowed: false, why: `${key} is tier 2 and tier 2 is off — set enableTier2: true on the hermes-thin row in ~/.dsh/profiles/desktop/cordis.patch.yml (or allow just this op via allowOps)` }
    }
    return cfg.enableTier3
      ? { allowed: true, why: 'tier 3 explicitly enabled' }
      : { allowed: false, why: `${key} is tier 3 (authority / credential / install surface) — set enableTier3: true on the hermes-thin row to expose it` }
  }

  function opPermission(entry) { return permissionForTier(entry.tier, opKey(entry)) }

  /** The descriptor Hermes reads instead of a hardcoded tool list. */
  async function commandDescriptor({ group, expand = false, service, refresh = false } = {}) {
    const groups = {}
    for (const entry of OPS) {
      if (group !== undefined && entry.group !== group) continue
      const perm = opPermission(entry)
      groups[entry.group] ??= []
      groups[entry.group].push({
        op: entry.op,
        tier: entry.tier,
        callable: perm.allowed,
        ...(perm.allowed ? {} : { blocked: perm.why }),
        summary: entry.summary,
        ...(entry.params ? { params: entry.params } : {}),
        ...(entry.required ? { required: entry.required } : {}),
      })
    }
    const curatedCallable = OPS.filter((e) => opPermission(e).allowed).length
    const catalog = await catalogReport({ service, expand, refresh })
    return {
      version: SERVER_INFO.version,
      tiers: {
        tier1: 'curated read + dispatch ops (always on)',
        tier2: cfg.enableTier2 ? 'enabled — every catalog method' : 'disabled (opt-in) — gates all catalog methods',
        tier3: cfg.enableTier3
          ? 'enabled — authority / credential / install services'
          : 'disabled (opt-in) — authority / credential / install services',
      },
      counts: {
        curatedOps: OPS.length,
        curatedCallable,
        ...(catalog.available === true ? { catalogServices: catalog.servicesPublished } : {}),
      },
      ...(Object.keys(groups).length > 0 ? { groups } : {}),
      mountedServices: [...injectedServices.keys()].filter((k) => injectedServices.get(k) !== undefined && injectedServices.get(k) !== null),
      catalog,
      ...(cfg.audit ? { recentOps: auditLog.slice(-10) } : {}),
      note: 'Call curated ops as dsh_cmd { group, op, args }; call any catalog method the same way ({ group: <serviceKey>, op: <methodName> }). The registry and the live catalog decide what exists, so new capabilities need no change on the Hermes side.',
    }
  }

  /** The single dispatcher. Everything flows through here, so audit + tiers cannot be bypassed. */
  async function dispatchCmd({ group, op, args }) {
    if (typeof group !== 'string' || typeof op !== 'string') {
      throw new Error('group and op are required (see dsh_commands)')
    }

    // ── curated ops first: they carry the ergonomics (warm session, pinned route/permissions) ──
    const entry = OPS.find((e) => e.group === group && e.op === op)
    if (entry) {
      const perm = opPermission(entry)
      if (!perm.allowed) throw new Error(perm.why)
      for (const field of entry.required ?? []) {
        if (args?.[field] === undefined) throw new Error(`${opKey(entry)} requires "${field}"`)
      }
      const started = Date.now()
      try {
        const result = await entry.run(args ?? {})
        audit({ at: new Date().toISOString(), op: opKey(entry), ok: true, ms: Date.now() - started, via: 'curated' })
        return result
      } catch (e) {
        const message = String(e?.message ?? e)
        audit({ at: new Date().toISOString(), op: opKey(entry), ok: false, ms: Date.now() - started, error: message, via: 'curated' })
        throw e
      }
    }

    // ── catalog path: any Host service method the running app publishes ──
    const catalog = await liveCatalog()
    if (catalog.available === false) {
      throw new Error(`unknown op "${group}.${op}", and the live service catalog is unavailable (${catalog.why ?? 'unknown reason'}) — call dsh_commands`)
    }
    const svc = (catalog.services ?? []).find((s) => s.key === group)
    if (!svc) {
      throw new Error(`unknown group "${group}" — dsh_commands lists the curated ops; harness.catalog lists the ${catalog.count} services the app publishes`)
    }
    const tier = catalogTierFor(group)
    const key = `${group}.${op}`
    const perm = permissionForTier(tier, key)
    if (!perm.allowed) throw new Error(perm.why)
    const target = resolveService(group)
    if (target === null) {
      throw new Error(`service "${group}" is not reachable in this composition (not injected, and ctx.get("${group}") / ctx.${group} are unavailable)`)
    }
    const catalogNames = (svc.methods ?? []).map((m) => m.name)
    // Services the catalog leaves undescribed (several tier-3 ones) are validated against the
    // live object's own methods instead — the catalog is a description, not the only truth.
    const known = catalogNames.length > 0 ? catalogNames : liveMethodNames(target)
    if (!known.includes(op)) {
      throw new Error(`unknown method "${op}" on service "${group}" — known: ${known.slice(0, 30).join(', ')}${known.length > 30 ? ` … (+${known.length - 30} more)` : ''}`)
    }
    if (typeof target[op] !== 'function') {
      throw new Error(`service "${group}" lists "${op}" but the live object has no such method`)
    }
    // Request-shaped methods take one object; pass an array to spread positional arguments.
    const callArgs = Array.isArray(args) ? args : [args ?? {}]
    // Method arguments: try the caller's as-is, then signature-derived variants (agent/signal/
    // session filled from what this plugin holds), in order, first success wins.
    const candidates = argumentCandidates((svc.methods ?? []).find((m) => m.name === op)?.signature ?? '', callArgs)
    const started = Date.now()
    let result
    let autoFilled = false
    let lastErr = null
    for (const [index, attempt] of candidates.entries()) {
      try {
        result = await target[op](...attempt)
        autoFilled = index > 0
        lastErr = null
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (lastErr) {
      audit({ at: new Date().toISOString(), op: key, ok: false, ms: Date.now() - started, error: String(lastErr?.message ?? lastErr), via: 'catalog' })
      throw lastErr
    }
    audit({ at: new Date().toISOString(), op: key, ok: true, ms: Date.now() - started, via: 'catalog', ...(autoFilled ? { autoFilledRuntimeArgs: true } : {}) })
    return { service: group, method: op, ...(autoFilled ? { autoFilledRuntimeArgs: true } : {}), result: safeView(result) }
  }

  /* ────────────────────────── MCP surface ────────────────────────── */

  const TOOLS = [
    {
      name: 'dsh_run',
      description:
        'Run a coding task in the DeepSeek Harness desktop app and return the result. Reuses one warm session per cwd (cheap); pass session_id to continue a specific session instead.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'The task, written as an instruction to the coding agent.' },
          cwd: { type: 'string', description: 'Absolute path of the repository to work in.' },
          session_id: { type: 'string', description: 'Optional harness session id to continue instead of the resident one.' },
          title: { type: 'string', description: 'Optional title for a newly created session.' },
        },
        required: ['task', 'cwd'],
      },
    },
    {
      name: 'dsh_sessions',
      description: 'List the warm sessions this bridge is holding in the harness, with token and cache-hit figures.',
      inputSchema: { type: 'object', properties: { cwd: { type: 'string' } } },
    },
    {
      name: 'dsh_stats',
      description: 'Token and cache-hit figures for one session (including cache read/write).',
      inputSchema: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] },
    },
    {
      name: 'dsh_health',
      description: 'Bridge health: version, pinned route, permission preset, resident session count.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'dsh_debug',
      description: 'Diagnostics: setup() outcomes per agent, last error, and each resident session\'s in-memory event types + last events + request header.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'dsh_workspaces',
      description: 'List the projects (repo folders) the Harness app shows in its sidebar, with session counts and which ones hold a warm session here.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'dsh_workspace_add',
      description: 'Register a folder as a project in the Harness app sidebar so its sessions appear under it. Idempotent.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path of the repo folder.' },
          title: { type: 'string', description: 'Optional display name.' },
        },
        required: ['path'],
      },
    },
    {
      name: 'dsh_workspace_remove',
      description: 'Remove a project from the app sidebar. Folders, files and session histories are never deleted. Pass path or id.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, id: { type: 'string' } },
      },
    },
    {
      name: 'dsh_commands',
      description: 'The bridge\'s self-describing command registry: groups, ops, tiers, which ops are callable right now, and recent dispatch audit. Read this instead of assuming what exists.',
      inputSchema: { type: 'object', properties: { group: { type: 'string', description: 'Optional: only this group.' } } },
    },
    {
      name: 'dsh_cmd',
      description: 'Dispatch one command from the registry (see dsh_commands). Tier gating and audit live here, so nothing bypasses them.',
      inputSchema: {
        type: 'object',
        properties: {
          group: { type: 'string' },
          op: { type: 'string' },
          args: { type: 'object', description: 'Op arguments, per the descriptor.' },
        },
        required: ['group', 'op'],
      },
    },
  ]

  const CALL = {
    dsh_run: runTask,
    dsh_sessions: listSessions,
    dsh_stats: statsFor,
    dsh_workspaces: listWorkspaces,
    dsh_workspace_add: addWorkspace,
    dsh_workspace_remove: removeWorkspace,
    dsh_commands: commandDescriptor,
    dsh_cmd: dispatchCmd,
    dsh_health: () => ({
      ok: true,
      version: SERVER_INFO.version,
      poolSize: pool.size,
      route: { provider: cfg.provider, model: cfg.model, reasoningEffort: cfg.reasoningEffort },
      preset: cfg.preset,
      permissionPreset: cfg.permissionPreset,
      workspaceRoots: cfg.workspaceRoots,
    }),
    dsh_debug: () => ({
      poolSize: pool.size,
      setup: setupLog,
      lastError,
      sessions: [...pool].map(([cwd, rec]) => {
        const agent = rec.handle?.agent
        const evts = logOf(agent)
        const counts = {}
        for (const e of evts) counts[e?.type ?? '?'] = (counts[e?.type ?? '?'] ?? 0) + 1
        let header = null
        try { header = agent?.session?.requestHeader?.() ?? null } catch (e) { header = `unavailable: ${String(e?.message ?? e)}` }
        return {
          cwd,
          sessionId: String(rec.sessionId),
          resident: rec.resident,
          events: evts.length,
          types: counts,
          requestHeader: header,
          tail: evts.slice(-8).map((e) => JSON.stringify(e).slice(0, 500)),
        }
      }),
    }),
  }

  function rpcResult(id, result) {
    return { jsonrpc: '2.0', id, result }
  }
  function rpcError(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } }
  }

  async function handleRpc(msg, res) {
    const { id, method, params } = msg ?? {}
    if (typeof method !== 'string') return rpcError(id ?? null, -32600, 'invalid request')
    // Notifications never get a reply, however the client addressed them.
    if (method.startsWith('notifications/') || method === 'initialized') return null
    if (id === undefined || id === null) return null // notification: no reply
    if (method === 'initialize') {
      res.setHeader('Mcp-Session-Id', randomUUID())
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      })
    }
    if (method === 'ping') return rpcResult(id, {})
    if (method === 'tools/list') return rpcResult(id, { tools: TOOLS })
    if (method === 'resources/list') return rpcResult(id, { resources: [] })
    if (method === 'prompts/list') return rpcResult(id, { prompts: [] })
    if (method === 'tools/call') {
      const name_ = params?.name
      const fn = CALL[name_]
      if (!fn) return rpcError(id, -32601, `unknown tool: ${String(name_)}`)
      try {
        const value = await fn(params?.arguments ?? {})
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
          structuredContent: value,
          isError: false,
        })
      } catch (e) {
        const message = String(e?.message ?? e)
        return rpcResult(id, { content: [{ type: 'text', text: `error: ${message}` }], isError: true })
      }
    }
    return rpcError(id, -32601, `unsupported method: ${method}`)
  }

  const server = createServer((req, res) => {
    const send = (code, body, type = 'application/json') => {
      const payload = typeof body === 'string' ? body : JSON.stringify(body)
      res.writeHead(code, { 'content-type': type, 'content-length': Buffer.byteLength(payload) })
      res.end(payload)
    }
    if (req.method === 'GET' && req.url?.startsWith('/health')) {
      return send(200, CALL.dsh_health())
    }
    if (req.method !== 'POST') return send(405, { error: 'POST required' })
    if (cfg.authToken !== '' && req.headers['authorization'] !== `Bearer ${cfg.authToken}`) {
      return send(401, { error: 'unauthorized' })
    }
    let raw = ''
    req.on('data', (c) => { raw += c; if (raw.length > 4_000_000) req.destroy() })
    req.on('end', async () => {
      let msg
      try { msg = JSON.parse(raw === '' ? '{}' : raw) } catch { return send(400, rpcError(null, -32700, 'parse error')) }
      const batch = Array.isArray(msg) ? msg : [msg]
      const replies = []
      for (const one of batch) {
        try {
          const reply = await handleRpc(one, res)
          if (reply !== null) replies.push(reply)
        } catch (e) {
          replies.push(rpcError(one?.id ?? null, -32603, String(e?.message ?? e)))
        }
      }
      if (replies.length === 0) { res.writeHead(202); return res.end() }
      return send(200, batch.length === 1 && !Array.isArray(msg) ? replies[0] : replies)
    })
  })

  /**
   * Start/stop through `ctx.effect` — the documented cleanup seam for resources like a network
   * connection. Without it, a plugin reload (HMR) leaves the socket bound and the next start
   * fails with EADDRINUSE.
   */
  const startEndpoint = () => {
    server.listen(cfg.port, cfg.host, () => {
      log(`MCP endpoint on http://${cfg.host}:${cfg.port}/mcp (route ${cfg.provider}/${cfg.model}, effort ${cfg.reasoningEffort})`)
    })
    return () => {
      try { server.close() } catch { /* already closing */ }
    }
  }
  server.on('error', (e) => log('http server error:', String(e?.message ?? e)))
  if (typeof ctx.effect === 'function') ctx.effect(startEndpoint, 'hermes-thin: mcp endpoint')
  else {
    const release = startEndpoint()
    ctx.on?.('dispose', release)
  }
  log('ready — sessions created here appear in the desktop app')
}
