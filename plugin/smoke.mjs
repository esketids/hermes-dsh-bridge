#!/usr/bin/env node
/**
 * Zero-dependency MCP smoke test for dsh-hermes-thin.
 *
 *   node smoke.mjs                      # handshake + tools/list + dsh_health
 *   node smoke.mjs --run <dir>          # also run one real task (burns tokens)
 *   DSH_BRIDGE_URL=http://127.0.0.1:8791/mcp node smoke.mjs
 *
 * Proves the four things that must hold before Hermes is wired in:
 *   1. the MCP handshake answers, 2. tools/list is populated,
 *   3. dsh_health reports the pinned route, 4. (with --run) a real harness turn completes
 *      and reports cache-hit numbers.
 */
const URL_BASE = process.env.DSH_BRIDGE_URL ?? 'http://127.0.0.1:8791/mcp'
const TOKEN = process.env.DSH_BRIDGE_TOKEN ?? ''
let sessionId = null
let seq = 0

async function rpc(method, params) {
  seq += 1
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: seq, method, params }),
  })
  const sid = res.headers.get('mcp-session-id')
  if (sid) sessionId = sid
  if (res.status === 202) return null
  const body = await res.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

async function call(tool, args = {}) {
  const r = await rpc('tools/call', { name: tool, arguments: args })
  const text = r?.content?.[0]?.text ?? ''
  if (r?.isError) throw new Error(`${tool} failed: ${text}`)
  return r?.structuredContent ?? JSON.parse(text)
}

const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail !== undefined && !ok ? ` -> ${JSON.stringify(detail)}` : ''}`)
  if (!ok) process.exitCode = 1
}

/** Notifications carry no id and expect no reply. */
async function notify(method, params = {}) {
  await fetch(URL_BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params }),
  })
}

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } })
check('initialize answers', Boolean(init?.serverInfo?.name), init)
check('session id issued', Boolean(sessionId))
await notify('notifications/initialized')

const tools = await rpc('tools/list', {})
check('tools/list populated', Array.isArray(tools?.tools) && tools.tools.length >= 4, tools?.tools?.map((t) => t.name))

const health = await call('dsh_health')
check('dsh_health ok', health?.ok === true, health)
console.log('   route:', JSON.stringify(health.route), '| preset:', health.preset, '| permission:', health.permissionPreset)

const sessions = await call('dsh_sessions')
check('dsh_sessions answers', Array.isArray(sessions?.sessions), sessions)
console.log('   resident sessions:', sessions.poolSize)

const ws = await call('dsh_workspaces')
check('dsh_workspaces answers', Array.isArray(ws?.workspaces) && typeof ws.count === 'number', ws)
console.log('   projects in the app sidebar:', ws.count, ws.workspaces.map((w) => `${w.title ?? '?'}${w.warm ? '*' : ''}`).join(', '))

const runIdx = process.argv.indexOf('--run')
if (runIdx !== -1) {
  const dir = process.argv[runIdx + 1]
  if (!dir) { console.error('--run needs a directory'); process.exit(1) }
  console.log(`\n--- real task in ${dir} (this calls the model) ---`)
  const r = await call('dsh_run', {
    task: 'Create hello.py that prints hello from the harness and run it. Reply with the program output only.',
    cwd: dir,
    title: 'smoke test',
  })
  check('dsh_run completed', typeof r?.sessionId === 'string', r)
  console.log('   sessionId:', r.sessionId, '| toolCalls:', r.run.toolCalls, '| turns:', r.run.turns, '| steps:', r.run.steps)
  console.log('   text:', JSON.stringify((r.text ?? '').slice(0, 300)))
  console.log('   run tokens  :', JSON.stringify(r.run))
  console.log('   cacheHitRate:', r.run.cacheHitRate, '(run) /', r.session.cacheHitRate, '(session)')
  const r2 = await call('dsh_run', { task: 'Run it again and reply with the output only.', cwd: dir })
  console.log('   2nd call cacheHitRate:', r2.run.cacheHitRate, '| input miss:', r2.run.input, 'cacheRead:', r2.run.cacheRead)
  console.log('   ^ run #2 is the number that matters: a warm resident session should show cacheRead >> input.')
}
console.log(process.exitCode ? '\nFAILED' : '\nall smoke checks passed')
