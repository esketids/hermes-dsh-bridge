#!/usr/bin/env node
/**
 * Cost benchmark: does a WARM resident session actually beat a FRESH session per task
 * on prompt-cache economics? Same repo content, same three tasks, two arms.
 *
 *   node bench.mjs <path-to-source-repo> [--url http://127.0.0.1:8791/mcp]
 *
 *   ARM "cold"  — every task gets its OWN directory copy and therefore its own brand-new
 *                 session: the prefix must be re-sent and re-read from scratch. This is
 *                 what `dsh --profile headless` does per invocation, and what any
 *                 create-a-session-per-task integration does.
 *   ARM "warm"  — one directory, one resident session, three tasks in sequence.
 *
 * Both arms run the identical task texts against byte-identical copies of the repo, so the
 * only variable is session reuse. Reports per-run tokens and the cache-hit rate, then the
 * per-arm totals in dollars at DeepSeek peak rates (halve them for off-peak).
 *
 * Prices per million tokens (DeepSeek peak, as billed through OpenRouter):
 *   input (cache miss) $0.30 · output $1.20 · cache read $0.006
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const srcRepo = process.argv[2]
if (!srcRepo) { console.error('usage: node bench.mjs <path-to-source-repo>'); process.exit(1) }
const URL_BASE = (process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:8791/mcp')

const TASKS = [
  'Explore this repository and write NOTES.md containing: the top-level files and folders with a one-line description of each, and the declared entry point. Keep it under 30 lines.',
  'Append a "## Data flow" section to NOTES.md describing how a request flows through this codebase end to end, naming the concrete functions involved.',
  'Append a "## Risk list" section to NOTES.md listing the three riskiest parts of this codebase and why, one sentence each.',
]

const PRICES = { input: 0.30 / 1e6, output: 1.20 / 1e6, cacheRead: 0.006 / 1e6 }
const R2 = (n) => Math.round(n * 100) / 100
const money = (n) => `$${n.toFixed(5)}`

const BENCH = resolve('bench')
let seq = 0
async function rpc(method, params) {
  seq += 1
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: seq, method, params }),
  })
  if (res.status === 202) return null
  const body = await res.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}
async function call(tool, args) {
  const r = await rpc('tools/call', { name: tool, arguments: args })
  if (r?.isError) throw new Error(`${tool}: ${r.content?.[0]?.text}`)
  return r.structuredContent
}

/** Copy the source repo (minus vcs/build dirs) so each arm works on identical bytes. */
function prepare(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  cpSync(srcRepo, dir, {
    recursive: true,
    filter: (p) => !/node_modules|\.git$|\/dist$|\/\.next$/.test(p),
  })
  return dir
}

const health = await (async () => { try { return await call('dsh_health') } catch (e) { console.error('bridge unreachable:', String(e.message)); process.exit(2) } })()
const source = basename(resolve(srcRepo))
console.log(`bridge: ${health.route.provider}/${health.route.model} effort=${health.route.reasoningEffort} | source repo: ${source}`)
console.log(`tasks: ${TASKS.length} per arm | repo bytes: ${execFileSync('sh', ['-c', `find ${JSON.stringify(resolve(srcRepo))} -type f | wc -c | tr -d ' '`]).toString().trim()}\n`)

const results = []
async function runTask(arm, dir, task, label) {
  const t0 = Date.now()
  const r = await call('dsh_run', { task, cwd: dir, title: `${arm} ${label}` })
  const row = {
    arm, label, sessionId: r.sessionId, wallMs: Date.now() - t0,
    turns: r.run.turns, steps: r.run.steps, toolCalls: r.run.toolCalls,
    input: r.run.input, cacheRead: r.run.cacheRead, cacheWrite: r.run.cacheWrite, output: r.run.output,
    cacheHitRate: r.run.cacheHitRate, sessionInput: r.session.input, sessionCacheRead: r.session.cacheRead,
    cost: r.run.input * PRICES.input + r.run.output * PRICES.output + r.run.cacheRead * PRICES.cacheRead,
    text: (r.text ?? '').slice(0, 120),
  }
  results.push(row)
  console.log(`  ${arm.padEnd(4)} ${label.padEnd(5)} session ${String(r.sessionId).slice(0, 8)} | miss ${String(row.input).padStart(6)} · cacheRead ${String(row.cacheRead).padStart(6)} · out ${String(row.output).padStart(5)} · hit ${row.cacheHitRate ?? '—'} · ${(row.wallMs / 1000).toFixed(0)}s · ${money(row.cost)}`)
  return row
}

console.log('ARM cold — a fresh session (own directory copy) per task, as a per-task CLI/session-per-task integration would do')
for (let i = 0; i < TASKS.length; i += 1) {
  const dir = prepare(join(BENCH, `cold${i + 1}`))
  await runTask('cold', dir, TASKS[i], `#${i + 1}`)
}

console.log('\nARM warm — one directory, one resident session, tasks in sequence')
{
  const dir = prepare(join(BENCH, 'warm'))
  for (let i = 0; i < TASKS.length; i += 1) await runTask('warm', dir, TASKS[i], `#${i + 1}`)
}

const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0)
const arms = ['cold', 'warm'].map((arm) => {
  const rows = results.filter((r) => r.arm === arm)
  const totals = {
    input: sum(rows, 'input'), output: sum(rows, 'output'), cacheRead: sum(rows, 'cacheRead'),
    toolCalls: sum(rows, 'toolCalls'), wallSec: R2(sum(rows, 'wallMs') / 1000), cost: sum(rows, 'cost'),
  }
  totals.hit = totals.cacheRead + totals.input > 0
    ? Math.round((totals.cacheRead / (totals.cacheRead + totals.input)) * 10000) / 10000 : null
  return { arm, runs: rows.length, totals }
})

console.log('\n================ SUMMARY ================')
console.log('arm    runs  miss-in   cache-read    output   cache-hit   tool-calls   cost(peak)   cost(off-peak)')
for (const a of arms) {
  const t = a.totals
  console.log(`${a.arm.padEnd(6)} ${String(a.runs).padStart(4)}  ${String(t.input).padStart(7)}  ${String(t.cacheRead).padStart(10)}  ${String(t.output).padStart(8)}   ${String(t.hit).padStart(9)}   ${String(t.toolCalls).padStart(10)}   ${money(t.cost).padStart(10)}   ${money(t.cost / 2).padStart(14)}`)
}
const cold = arms[0].totals, warm = arms[1].totals
console.log(`\nwarm vs cold on the same work: prompt tokens ${cold.input + cold.cacheRead} -> ${warm.input + warm.cacheRead} (${Math.round((1 - (warm.input + warm.cacheRead) / Math.max(1, cold.input + cold.cacheRead)) * 100)}% fewer)`)
console.log(`cost ${money(cold.cost)} -> ${money(warm.cost)} (${cold.cost > 0 ? `${(cold.cost / Math.max(warm.cost, 1e-9)).toFixed(2)}x cheaper` : '—'})`)

writeFileSync(join(BENCH, 'results.json'), JSON.stringify({ source: resolve(srcRepo), route: health.route, tasks: TASKS, results, arms }, null, 2))
console.log('\nper-run detail written to bench/results.json')
