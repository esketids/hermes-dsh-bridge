/**
 * Zero-dependency tests for named-args.mjs. Run with:
 *
 *   node plugin/lib/named-args.test.mjs
 *
 * node:assert only — no test framework, because the plugin ships with no dependencies.
 */

import assert from 'node:assert/strict'
import { positionalFromNamed } from './named-args.mjs'

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

/* ── the live failure: a two-parameter setter given by name ─────────────────────────────── */

check('set(ref: string, value: string) maps { ref, value } in signature order', () => {
  const sig = 'set(ref: string, value: string): void'
  assert.deepEqual(
    positionalFromNamed(sig, { ref: 'HERMES_PROBE_TMP_KEY', value: 'x' }),
    ['HERMES_PROBE_TMP_KEY', 'x'],
  )
  // key order in the object never decides the positional order
  assert.deepEqual(positionalFromNamed(sig, { value: 'x', ref: 'HERMES_PROBE_TMP_KEY' }), ['HERMES_PROBE_TMP_KEY', 'x'])
})

check('a single declared parameter supplied by name maps to a one-element array', () => {
  assert.deepEqual(positionalFromNamed('apply(input: { a: string }): void', { input: { a: 'x' } }), [{ a: 'x' }])
})

check('a key the signature does not declare leaves the object untouched (undefined)', () => {
  const sig = 'set(ref: string, value: string): void'
  assert.equal(positionalFromNamed(sig, { ref: 'A', value: 'x', extra: 'y' }), undefined)
})

/* ── request-shaped methods keep their object ───────────────────────────────────────────── */

check('a request-object method is left untouched', () => {
  assert.equal(positionalFromNamed('search(request: SearchRequest): Promise<Result[]>', { query: 'x' }), undefined)
})

/* ── shapes that never qualify ──────────────────────────────────────────────────────────── */

check('an empty object and an array do not qualify', () => {
  const sig = 'set(ref: string, value: string): void'
  assert.equal(positionalFromNamed(sig, {}), undefined)
  assert.equal(positionalFromNamed(sig, [{ ref: 'A', value: 'x' }]), undefined)
})

check('a signature with no parameters or no signature at all does not qualify', () => {
  assert.equal(positionalFromNamed('list(): string[]', { ref: 'A' }), undefined)
  assert.equal(positionalFromNamed(null, { ref: 'A' }), undefined)
})

/* ── absence is never invented ──────────────────────────────────────────────────────────── */

check('an omitted parameter in the middle keeps its slot as undefined (no shifting)', () => {
  const sig = 'run(task: string, cwd?: string, title?: string): void'
  // `cwd` is omitted: it keeps its declared slot as `undefined`, so `X` never binds to `cwd`.
  assert.deepEqual(positionalFromNamed(sig, { task: 'T', title: 'X' }), ['T', undefined, 'X'])
})

check('trailing omitted parameters are not padded', () => {
  const sig = 'run(task: string, cwd?: string, title?: string): void'
  assert.deepEqual(positionalFromNamed(sig, { task: 'T' }), ['T'])
  // a gap at the end: the list stops at the last supplied parameter
  assert.deepEqual(positionalFromNamed(sig, { task: 'T', cwd: 'cwd-value' }), ['T', 'cwd-value'])
})

check('a parameter supplied after an omitted required predecessor keeps its position', () => {
  const sig = 'set(ref: string, value: string): void'
  assert.deepEqual(positionalFromNamed(sig, { value: 'x' }), [undefined, 'x'])
})

check('values are mapped verbatim — false and 0 are values, not absences', () => {
  assert.deepEqual(positionalFromNamed('set(flag: boolean, count: number): void', { flag: false, count: 0 }), [false, 0])
})

/* ── summary ───────────────────────────────────────────────────────────────────────────── */

console.log(`\nnamed-args: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
