/**
 * Zero-dependency tests for write-guard.mjs. Run with:
 *
 *   node plugin/lib/write-guard.test.mjs
 *
 * node:assert only — no test framework, because the plugin ships with no dependencies.
 */

import assert from 'node:assert/strict'
import {
  AUTHORITY_SERVICES,
  IN_PROCESS_ONLY,
  MUTATING_OP,
  REF_NAME_RE,
  callerAttemptsOnly,
  guardWriteCall,
  isAuthorityService,
  isFunctionTyped,
  isMutatingOp,
  signatureParams,
} from './write-guard.mjs'

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

const SET = { service: 'credentials', op: 'set', signature: 'set(ref: string, value: string): void' }
const guard = (over = {}) => guardWriteCall({ ...SET, ...over })
const refused = (result) => {
  assert.equal(result.ok, false, 'expected a refusal')
  assert.equal(typeof result.why, 'string')
  assert.ok(result.why.length > 0, 'a refusal carries a reason')
  return result.why
}

/* ── the incident shape ─────────────────────────────────────────────────────────────────── */

check('credentials.set with args {} is refused', () => {
  const why = refused(guard({ args: {} }))
  assert.ok(why.includes('explicit arguments'), why)
})

check('credentials.set with args omitted is refused', () => {
  refused(guard())
  refused(guard({ args: undefined }))
})

check('credentials.set with args null / [] / primitive is refused', () => {
  refused(guard({ args: null }))
  refused(guard({ args: [] }))
  refused(guard({ args: 42 }))
  refused(guard({ args: 'HERMES_PROBE_TMP_KEY' }))
})

/* ── required parameters ────────────────────────────────────────────────────────────────── */

check('a missing required param is refused and the reason names it', () => {
  const why = refused(guard({ args: { ref: 'HERMES_PROBE_TMP_KEY' } }))
  assert.ok(why.includes('value'), `reason should name "value": ${why}`)

  const why2 = refused(guard({ args: { value: 'probe-value' } }))
  assert.ok(why2.includes('ref'), `reason should name "ref": ${why2}`)
})

check('a required param whose value is {} is refused and the reason names it', () => {
  const why = refused(guard({ args: { ref: 'HERMES_PROBE_TMP_KEY', value: {} } }))
  assert.ok(why.includes('value'), `reason should name "value": ${why}`)

  const why2 = refused(guard({ args: { ref: {}, value: 'probe-value' } }))
  assert.ok(why2.includes('ref'), `reason should name "ref": ${why2}`)
})

check('required params given as [] / "" / null are refused', () => {
  refused(guard({ args: { ref: [], value: 'probe-value' } }))
  refused(guard({ args: { ref: 'HERMES_PROBE_TMP_KEY', value: '' } }))
  refused(guard({ args: { ref: null, value: 'probe-value' } }))
  refused(guard({ args: { ref: 'HERMES_PROBE_TMP_KEY', value: null } }))
})

check('a required param of the wrong declared type is refused', () => {
  const why = refused(guard({ args: { ref: 7, value: 'probe-value' } }))
  assert.ok(why.includes('ref'), why)
})

check('a required param on a positional (array) call is checked too', () => {
  refused(guard({ args: [] }))
  refused(guard({ args: [{}] }))
  assert.equal(guard({ args: ['HERMES_PROBE_TMP_KEY', 'probe-value'] }).ok, true)
})

/* ── reference grammar ──────────────────────────────────────────────────────────────────── */

check('ref-like values must match the harness reference grammar', () => {
  for (const bad of [{}, '', 'has space', '1abc', 'has-dash', 'has.dot']) {
    refused(guard({ args: { ref: bad, value: 'probe-value' } }))
  }
  assert.equal(guard({ args: { ref: 'HERMES_PROBE_TMP_KEY', value: 'probe-value' } }).ok, true)
  assert.ok(REF_NAME_RE.test('HERMES_PROBE_TMP_KEY'))
})

check('ref-like names are recognised by name (key / name / env)', () => {
  const sig = 'write(key: string, value: string): void'
  refused(guardWriteCall({ service: 'credentials', op: 'write', signature: sig, args: { key: 'has space', value: 'probe-value' } }))
  const sig2 = 'add(name: string): void'
  refused(guardWriteCall({ service: 'configEditor', op: 'add', signature: sig2, args: { name: '1abc' } }))
  const sig3 = 'put(env: string, value: string): void'
  refused(guardWriteCall({ service: 'credentials', op: 'put', signature: sig3, args: { env: '', value: 'probe-value' } }))
})

/* ── secrets ────────────────────────────────────────────────────────────────────────────── */

check('secret-like values must be non-empty strings', () => {
  for (const name of ['value', 'secret', 'token', 'apiKey', 'apiKeyEnv', 'password']) {
    const sig = `set(ref: string, ${name}?: string): void`
    refused(guardWriteCall({ service: 'credentials', op: 'set', signature: sig, args: { ref: 'OK_REF', [name]: '' } }))
    assert.equal(guardWriteCall({ service: 'credentials', op: 'set', signature: sig, args: { ref: 'OK_REF', [name]: 'probe-value' } }).ok, true)
  }
})

/* ── the guard's footprint ──────────────────────────────────────────────────────────────── */

check('a read op is always accepted, even with empty args', () => {
  assert.equal(guardWriteCall({ service: 'credentials', op: 'list', signature: 'list(): string[]', args: {} }).ok, true)
  assert.equal(guardWriteCall({ service: 'credentials', op: 'list' }).ok, true)
  assert.equal(guardWriteCall({ service: 'credentials', op: 'get', signature: 'get(ref: string): string', args: {} }).ok, true)
})

check('a non-authority service is always accepted (the guard only narrows attempts)', () => {
  assert.equal(guardWriteCall({ service: 'assets', op: 'setX', signature: 'setX(a: string): void', args: {} }).ok, true)
  assert.equal(guardWriteCall({ service: 'workspaceRegistry', op: 'delete', args: {} }).ok, true)
})

check('authority/op predicates', () => {
  for (const key of ['credentials', 'credentialsController', 'deepseekAccount', 'authorization', 'pluginManager', 'configEditor']) {
    assert.ok(AUTHORITY_SERVICES.includes(key), key)
    assert.ok(isAuthorityService(key), key)
  }
  assert.equal(isAuthorityService('assets'), false)
  assert.equal(isAuthorityService(undefined), false)
  for (const op of ['set', 'setValue', 'put', 'delete', 'remove', 'clear', 'signIn', 'signOut', 'update', 'install', 'uninstall']) {
    assert.ok(isMutatingOp(op), op)
    assert.ok(MUTATING_OP.test(op), op)
  }
  for (const op of ['list', 'get', 'read', 'describe', 'status', 'configuration', 'keys', 'catalog', 'name']) {
    assert.equal(isMutatingOp(op), false, op)
  }
})

check('the verbs this credentials surface uses are mutating', () => {
  for (const op of ['unset', 'modifyRecord', 'deleteRecord', 'setValue']) {
    assert.ok(isMutatingOp(op), op)
    assert.ok(MUTATING_OP.test(op), op)
  }
})

check('the verbs this credentials surface reads with are not mutating', () => {
  for (const op of ['resolve', 'describe', 'listRecords', 'readRecord', 'describeRecord', 'list', 'get', 'status', 'setup', 'address', 'enabled']) {
    assert.equal(isMutatingOp(op), false, op)
    assert.equal(MUTATING_OP.test(op), false, op)
  }
})

check('the verb match stays case-insensitive', () => {
  for (const op of ['Set', 'SetValue', 'DELETE', 'Unset', 'ModifyRecord', 'UNMOUNT']) {
    assert.ok(isMutatingOp(op), op)
  }
})

/* ── reasons never leak a value ─────────────────────────────────────────────────────────── */

check('no reason string contains any supplied value', () => {
  const secret = 'sk-or-v1-DEADBEEF-DO-NOT-LEAK-0123456789'
  const refish = 'HAS SPACE AND A SECRET sk-or-v1-LEAK'
  const cases = [
    {},
    { ref: 'HERMES_PROBE_TMP_KEY' },
    { value: secret },
    { ref: refish, value: secret },
    { ref: secret, value: secret },
    { ref: 'OK_REF', value: secret, token: secret },
    { ref: 'OK_REF', value: {}, extra: secret },
    { ref: {}, value: secret },
    { ref: 'OK_REF', [secret]: secret },
  ]
  for (const args of cases) {
    const result = guard({ args })
    if (result.ok) continue
    assert.ok(!result.why.includes(secret), `reason leaked a secret: ${result.why}`)
    assert.ok(!result.why.includes(refish), `reason leaked a ref value: ${result.why}`)
    assert.ok(!result.why.includes('DEADBEEF'), `reason leaked part of a value: ${result.why}`)
  }
  // …and the accepted case (which carries the secret) has no reason at all.
  const accepted = guard({ args: { ref: 'HERMES_PROBE_TMP_KEY', value: secret } })
  assert.equal(accepted.ok, true)
  assert.equal(accepted.why, undefined)
})

/* ── dispatcher helper ─────────────────────────────────────────────────────────────────── */

check('callerAttemptsOnly keeps only the caller list for a mutating op', () => {
  const candidates = [[{ ref: 'A', value: 'v' }], [undefined, new AbortController().signal], [{ ref: 'A', value: 'v' }, undefined]]
  assert.deepEqual(callerAttemptsOnly('set', candidates), [candidates[0]])
  assert.deepEqual(callerAttemptsOnly('delete', candidates), [candidates[0]])
  assert.equal(callerAttemptsOnly('list', candidates), candidates)
  assert.equal(callerAttemptsOnly('set', undefined), undefined)
})

/* ── parser ────────────────────────────────────────────────────────────────────────────── */

check('signatureParams parses the published form', () => {
  assert.deepEqual(signatureParams('set(ref: string, value: string): void'), [
    { name: 'ref', optional: false, type: 'string' },
    { name: 'value', optional: false, type: 'string' },
  ])
  assert.deepEqual(signatureParams('list(agent?: Agent, signal?: AbortSignal): Promise<string[]>'), [
    { name: 'agent', optional: true, type: 'Agent' },
    { name: 'signal', optional: true, type: 'AbortSignal' },
  ])
  assert.deepEqual(signatureParams('apply(input: { a: string, b: number }): void'), [
    { name: 'input', optional: false, type: '{ a: string, b: number }' },
  ])
  assert.deepEqual(signatureParams(null), [])
  assert.deepEqual(signatureParams('noParens'), [])
  // arrow types: the `>` in `=>` must not be read as a closing bracket
  assert.deepEqual(signatureParams('list(onProgress: (done: number) => void): void'), [
    { name: 'onProgress', optional: false, type: '(done: number) => void' },
  ])
  assert.deepEqual(signatureParams('watch(target: string, changed: (error?: Error) => void, signal: AbortSignal): void'), [
    { name: 'target', optional: false, type: 'string' },
    { name: 'changed', optional: false, type: '(error?: Error) => void' },
    { name: 'signal', optional: false, type: 'AbortSignal' },
  ])
  // generics keep their own angle-bracket depth
  assert.deepEqual(signatureParams('apply(input: Map<string, number>, provider: ToolProvider): void'), [
    { name: 'input', optional: false, type: 'Map<string, number>' },
    { name: 'provider', optional: false, type: 'ToolProvider' },
  ])
})

/* ── registry-writer verbs ──────────────────────────────────────────────────────────────── */

check('registry-writer verbs are mutating, and the boundary rule still holds', () => {
  for (const op of ['register', 'deregister', 'attach', 'detach', 'subscribe', 'unsubscribe', 'bind', 'unbind', 'suppress', 'override', 'define', 'provide', 'expose', 'configure', 'enter']) {
    assert.ok(isMutatingOp(op), op)
    assert.ok(MUTATING_OP.test(op), op)
  }
  for (const op of ['address', 'setup', 'status', 'enabled', 'provider', 'binding', 'enterprise', 'listener', 'definitions']) {
    assert.equal(isMutatingOp(op), false, op)
  }
})

/* ── the unbridgeable rule: callbacks cannot cross MCP ──────────────────────────────────── */

check('isFunctionTyped recognises arrow types and producer identifiers', () => {
  for (const type of ['(error?: Error) => void', '() => string', '(current: T) => T', 'Provider', 'Listener', 'Factory', 'Installer', 'Contributor', 'Resolver', 'Callback', 'Handler', 'Hook']) {
    assert.equal(isFunctionTyped(type), true, type)
  }
  for (const type of ['string', 'number', 'Agent', 'AbortSignal', 'string[]', '', null, undefined, 'Provider | undefined']) {
    assert.equal(isFunctionTyped(type), false, String(type))
  }
})

check('a required function-typed param is refused for any service, reads included', () => {
  const why = refused(guardWriteCall({
    service: 'assets',
    op: 'list',
    signature: 'list(onProgress: (done: number) => void): void',
    args: {},
  }))
  assert.ok(why.includes('onProgress'), why)
  assert.ok(why.includes('cannot cross the MCP boundary'), why)

  const why2 = refused(guardWriteCall({
    service: 'session',
    op: 'get',
    signature: 'get(provider: ThemeProvider): Theme',
    args: {},
  }))
  assert.ok(why2.includes('provider'), why2)
})

check('a value supplied for a function-typed param is refused', () => {
  const why = refused(guardWriteCall({
    service: 'assets',
    op: 'run',
    signature: 'run(task: string, onEvent?: (e: Event) => void): void',
    args: { task: 'T', onEvent: () => {} },
  }))
  assert.ok(why.includes('onEvent'), why)
  assert.ok(why.includes('cannot cross the MCP boundary'), why)

  const why2 = refused(guardWriteCall({
    service: 'assets',
    op: 'watch',
    signature: 'watch(target: string, changed: (error?: Error) => void, signal?: AbortSignal): void',
    args: ['/tmp/x', () => {}],
  }))
  assert.ok(why2.includes('changed'), why2)
  // an omitted optional function-typed param leaves an ordinary call alone
  assert.equal(guardWriteCall({ service: 'assets', op: 'run', signature: 'run(task: string, onEvent?: (e: Event) => void): void', args: { task: 'T' } }).ok, true)
})

check('IN_PROCESS_ONLY is exported, complete, and refused outright', () => {
  for (const key of ['systemPrompt.section', 'systemPrompt.context', 'systemPrompt.variable', 'systemPrompt.tools', 'systemPrompt.suppressRuntimeContext', 'tools.presentAs', 'tools.restrict']) {
    assert.ok(IN_PROCESS_ONLY.includes(key), key)
  }
  for (const key of IN_PROCESS_ONLY) {
    const [service, op] = key.split('.')
    const why = refused(guardWriteCall({ service, op, args: {} }))
    assert.ok(why.includes('cannot cross the MCP boundary'), why)
    assert.ok(why.includes(key), why)
  }
})

check('ordinary reads are still accepted', () => {
  assert.equal(guardWriteCall({ service: 'assets', op: 'list', signature: 'list(signal?: AbortSignal): Promise<string[]>', args: {} }).ok, true)
  assert.equal(guardWriteCall({ service: 'tools', op: 'list', signature: 'list(): ToolDescriptor[]', args: {} }).ok, true)
  assert.equal(guardWriteCall({ service: 'systemPrompt', op: 'describe', signature: 'describe(): string', args: {} }).ok, true)
  assert.equal(guardWriteCall({ service: 'timer', op: 'now', signature: 'now(): number', args: undefined }).ok, true)
})

/* ── summary ───────────────────────────────────────────────────────────────────────────── */

console.log(`\nwrite-guard: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
