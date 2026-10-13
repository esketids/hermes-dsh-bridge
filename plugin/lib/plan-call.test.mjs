/**
 * Zero-dependency tests for plan-call.mjs. Run with:
 *
 *   node plugin/lib/plan-call.test.mjs
 *
 * node:assert only — no test framework, because the plugin ships with no dependencies.
 */

import assert from 'node:assert/strict'
import { planCall } from './plan-call.mjs'

let passed = 0
let failed = 0

function check(label, fn) {
  try {
    fn()
    passed += 1
    console.log(`ok   ${label}`)
  } catch (e) {
    failed += 1
    console.error(`FAIL ${label}`)
    console.error(`     ${String(e?.message ?? e).split('\n').join('\n     ')}`)
  }
}

const allowed = (why = 'tier 2 enabled') => ({ allowed: true, why })
const denied = (why = 'assets.list is tier 2 and tier 2 is off') => ({ allowed: false, why })

/* ── reachable ──────────────────────────────────────────────────────────────────────────── */

check('a permitted read with a live method is reachable', () => {
  const report = planCall({
    service: 'assets',
    op: 'list',
    signature: 'list(signal?: AbortSignal): Promise<string[]>',
    args: {},
    tier: 2,
    permission: allowed(),
    hasMethod: true,
  })
  assert.equal(report.reachable, true)
  assert.deepEqual(report.refusals, [])
  assert.equal(report.hasMethod, true)
  assert.equal(report.named, false)
  assert.equal(report.guard.ok, true)
  assert.equal(report.tier, 2)
  assert.equal(report.signature, 'list(signal?: AbortSignal): Promise<string[]>')
  assert.deepEqual(report.params, [
    { name: 'signal', optional: true, type: 'AbortSignal' },
  ])
})

/* ── refusals ───────────────────────────────────────────────────────────────────────────── */

check('a permission refusal is reported with reachable: false', () => {
  const report = planCall({
    service: 'assets',
    op: 'list',
    signature: 'list(): Promise<string[]>',
    args: {},
    tier: 2,
    permission: denied('assets.list blocked by denyOps'),
    hasMethod: true,
  })
  assert.equal(report.reachable, false)
  assert.deepEqual(report.refusals, ['assets.list blocked by denyOps'])
  assert.equal(report.permission.allowed, false)
})

check('a missing method is reported with reachable: false', () => {
  const report = planCall({
    service: 'assets',
    op: 'nope',
    signature: '',
    args: {},
    tier: 2,
    permission: allowed(),
    hasMethod: false,
  })
  assert.equal(report.reachable, false)
  assert.equal(report.hasMethod, false)
  assert.ok(report.refusals.some((why) => why.includes('no method')), JSON.stringify(report.refusals))
})

check('a guard refusal surfaces in refusals', () => {
  const report = planCall({
    service: 'assets',
    op: 'register',
    signature: 'register(name: Listener): void',
    args: {},
    tier: 2,
    permission: allowed(),
    hasMethod: true,
  })
  assert.equal(report.reachable, false)
  assert.equal(report.guard.ok, false)
  assert.ok(report.guard.why.includes('name'), report.guard.why)
  assert.deepEqual(report.refusals, [report.guard.why])
  assert.ok(report.refusals[0].includes('cannot cross the MCP boundary'), report.refusals[0])
})

check('an unbridgeable registry writer is refused even on an allowed read', () => {
  const report = planCall({
    service: 'systemPrompt',
    op: 'tools',
    signature: 'tools(section: (context: object) => string): Disposable',
    args: {},
    tier: 2,
    permission: allowed(),
    hasMethod: true,
  })
  assert.equal(report.reachable, false)
  assert.ok(report.refusals[0].includes('systemPrompt.tools'), report.refusals[0])
})

/* ── named mapping and the redacted shape summary ───────────────────────────────────────── */

check('set(ref, value) by name shows named: true and two redacted entries', () => {
  const report = planCall({
    service: 'credentials',
    op: 'set',
    signature: 'set(ref: string, value: string): void',
    args: { ref: 'HERMES_PROBE_TMP_KEY', value: 'probe-value' },
    tier: 3,
    permission: allowed('tier 3 explicitly enabled'),
    hasMethod: true,
  })
  assert.equal(report.named, true)
  assert.equal(report.callArgs.length, 2)
  assert.deepEqual(report.callArgs, [
    { position: 0, kind: 'string', length: 20 },
    { position: 1, kind: 'string', length: 11 },
  ])
  assert.equal(report.reachable, true)
})

check('a positional array keeps its order and is summarised by shape', () => {
  const report = planCall({
    service: 'assets',
    op: 'run',
    signature: 'run(task: string, count: number, flag?: boolean): void',
    args: ['T', 3, false],
    tier: 2,
    permission: allowed(),
    hasMethod: true,
  })
  assert.equal(report.named, false)
  assert.deepEqual(report.callArgs, [
    { position: 0, kind: 'string', length: 1 },
    { position: 1, kind: 'number' },
    { position: 2, kind: 'boolean' },
  ])
})

check('null, undefined, arrays, objects and runtime handles are named, never valued', () => {
  const report = planCall({
    service: 'assets',
    op: 'run',
    signature: 'run(a: unknown, b: unknown, c: unknown, d: unknown, e: unknown): void',
    args: [null, undefined, [1, 2, 3], { nested: 'secret' }, new AbortController().signal],
    tier: 2,
    permission: allowed(),
    hasMethod: true,
  })
  assert.deepEqual(report.callArgs, [
    { position: 0, kind: 'null' },
    { position: 1, kind: 'undefined' },
    { position: 2, kind: 'array', length: 3 },
    { position: 3, kind: 'object' },
    { position: 4, kind: 'AbortSignal' },
  ])
})

/* ── no value ever reaches the report ───────────────────────────────────────────────────── */

check('JSON.stringify(report) contains no supplied value', () => {
  const secret = 'sk-or-v1-DEADBEEF-DO-NOT-LEAK-0123456789'
  const ref = 'REF_DO_NOT_LEAK_THIS_NAME'
  const cases = [
    { service: 'credentials', op: 'set', signature: 'set(ref: string, value: string): void', args: { ref, value: secret } },
    { service: 'credentials', op: 'set', signature: 'set(ref: string, value: string): void', args: { ref: 'OK', value: {} } },
    { service: 'assets', op: 'run', signature: 'run(task: string): void', args: { task: secret } },
    { service: 'assets', op: 'run', signature: 'run(a: unknown): void', args: [secret] },
    { service: 'assets', op: 'run', signature: 'run(a: unknown): void', args: ['REF_DO_NOT_LEAK_THIS_NAME'] },
  ]
  for (const input of cases) {
    const report = planCall({ ...input, tier: 3, permission: allowed(), hasMethod: true })
    const text = JSON.stringify(report)
    assert.ok(!text.includes(secret), `report leaked a secret: ${text}`)
    assert.ok(!text.includes(ref), `report leaked a ref: ${text}`)
    assert.ok(!text.includes('DEADBEEF'), `report leaked part of a value: ${text}`)
  }
})

/* ── summary ───────────────────────────────────────────────────────────────────────────── */

console.log(`\nplan-call: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
